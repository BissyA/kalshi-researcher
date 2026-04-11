import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";
import { callAgentForJson } from "@/lib/claude-client";

interface AISection {
  title: string;
  description: string;
  section_type: "remarks" | "qa" | "introduction" | "closing" | "other";
  category: string; // existing category name or new proposed category
  segment_indices: number[];
}

interface SectioningResult {
  sections: AISection[];
  new_categories: string[]; // categories not in the existing list
}

function buildSectioningPrompt(existingCategories: string[]): string {
  const catSection = existingCategories.length > 0
    ? `\nEXISTING CATEGORIES for this speaker:\n${existingCategories.map((c) => `- ${c}`).join("\n")}\n\nAssign each section to one of these categories. If a section genuinely does not fit ANY existing category, propose a new category name — but prefer using existing ones. New categories should be broad topic areas (e.g. "Healthcare", "Trade & Tariffs"), NOT structural labels.\n`
    : `\nThis is the FIRST transcript for this speaker, so no categories exist yet. Propose appropriate content categories based on the topics covered. Categories should be broad topic areas like "Economy", "Foreign Policy", "Military / Defense", "Border & Immigration", "Healthcare", "Law & Order", etc. Do NOT use structural labels like "Opening", "Q&A", "Closing", "Remarks" as categories — those go in section_type.\n`;

  return `You are a speech/transcript structure analyst. You will receive a transcript that has been split into ordered segments. Your job is to group these segments into logical SECTIONS (topic blocks) and assign each section a content CATEGORY.

RULES:
1. Every segment must be assigned to exactly one section. Use segment indices (0-based) to reference segments.
2. Sections must be in chronological order (segment indices should be contiguous and ascending within each section).
3. Each section gets:
   - title: Short, descriptive title for the topic (e.g. "Iran Military Campaign", "TSA Workforce Crisis")
   - description: 1-2 sentence summary of what this section covers
   - section_type: One of "introduction", "remarks", "qa", "closing", "other" — this describes the STRUCTURAL FORMAT
   - category: The CONTENT TOPIC category (e.g. "Foreign Policy", "Economy") — this is separate from section_type
   - segment_indices: array of segment indices belonging to this section
4. CRITICAL: "category" is about CONTENT (what topic is discussed), NOT about format. A Q&A section about Iran should have category "Foreign Policy" and section_type "qa". An opening that discusses the economy should have category "Economy" and section_type "introduction".
5. Non-speaker segments (questions, stage directions) should be included in the section they contextually belong to.
6. Aim for 5-15 sections for a typical speech.
${catSection}
Return JSON:
{
  "sections": [
    {
      "title": "...",
      "description": "...",
      "section_type": "remarks",
      "category": "Foreign Policy",
      "segment_indices": [0, 1, 2, 3]
    },
    ...
  ],
  "new_categories": ["any", "new", "categories", "proposed"]
}

The "new_categories" array should list ONLY category names that are NOT in the existing categories list. If all sections fit existing categories, return an empty array.`;
}

// GET — list sections for a transcript
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getServerSupabase();

  const { data: sections } = await supabase
    .from("transcript_sections")
    .select("*")
    .eq("transcript_id", id)
    .order("order_index");

  const { data: segments } = await supabase
    .from("transcript_segments")
    .select("*")
    .eq("transcript_id", id)
    .order("order_index");

  return NextResponse.json({
    sections: sections ?? [],
    segments: segments ?? [],
  });
}

// POST — trigger AI sectioning
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getServerSupabase();

  // Verify transcript is approved for cleaning
  const { data: transcript, error: fetchError } = await supabase
    .from("transcripts")
    .select("id, cleaning_status, speaker, speaker_id")
    .eq("id", id)
    .single();

  if (fetchError || !transcript) {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }

  if (transcript.cleaning_status !== "approved") {
    return NextResponse.json(
      { error: "Cleaning must be approved before sectioning" },
      { status: 400 }
    );
  }

  // Fetch segments
  const { data: segments } = await supabase
    .from("transcript_segments")
    .select("*")
    .eq("transcript_id", id)
    .order("order_index");

  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "No segments found" }, { status: 400 });
  }

  // Load existing categories for this speaker
  let existingCategories: string[] = [];
  if (transcript.speaker_id) {
    const { data: cats } = await supabase
      .from("speaker_categories")
      .select("name")
      .eq("speaker_id", transcript.speaker_id)
      .order("order_index");
    existingCategories = (cats ?? []).map((c) => c.name);
  }

  // Set status to processing
  await supabase
    .from("transcripts")
    .update({ sectioning_status: "processing" })
    .eq("id", id);

  try {
    // Format segments for AI
    const segmentList = segments.map((s, i) => ({
      index: i,
      text: s.text.substring(0, 200) + (s.text.length > 200 ? "..." : ""),
      is_speaker: s.is_speaker_content,
      attribution: s.attribution,
    }));

    const systemPrompt = buildSectioningPrompt(existingCategories);

    const { data: result } = await callAgentForJson<SectioningResult>({
      systemPrompt,
      userMessage: `Speaker: ${transcript.speaker}\n\nTotal segments: ${segments.length}\n\nSegments:\n${JSON.stringify(segmentList, null, 2)}`,
      enableWebSearch: false,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 8000,
    });

    if (!result.sections || !Array.isArray(result.sections) || result.sections.length === 0) {
      throw new Error("AI returned no sections");
    }

    // Delete existing sections and their word detections
    await supabase
      .from("transcript_sections")
      .delete()
      .eq("transcript_id", id);

    // Clear section_id on all segments
    await supabase
      .from("transcript_segments")
      .update({ section_id: null })
      .eq("transcript_id", id);

    // Clean up pending categories from previous runs (approved ones stay)
    if (transcript.speaker_id) {
      await supabase
        .from("speaker_categories")
        .delete()
        .eq("speaker_id", transcript.speaker_id)
        .eq("status", "pending");
    }

    // Persist new categories as 'pending' immediately
    // Don't rely solely on AI's new_categories — scan all category names used
    // in sections and ensure any not already in speaker_categories get created.
    const aiNewCats = new Set(result.new_categories ?? []);
    const sectionCats = new Set(
      result.sections.map((s) => s.category).filter((c): c is string => !!c)
    );
    // Merge: anything the AI used that isn't already an existing category
    const existingSet = new Set(existingCategories.map((c) => c.toLowerCase()));
    const allNewCats: string[] = [];
    for (const cat of sectionCats) {
      if (!existingSet.has(cat.toLowerCase())) {
        allNewCats.push(cat);
      }
    }
    // Also include anything in AI's new_categories not already covered
    for (const cat of aiNewCats) {
      if (!existingSet.has(cat.toLowerCase()) && !allNewCats.find((c) => c.toLowerCase() === cat.toLowerCase())) {
        allNewCats.push(cat);
      }
    }

    if (transcript.speaker_id && allNewCats.length > 0) {
      // Get current max order_index
      const { data: existingCatsForOrder } = await supabase
        .from("speaker_categories")
        .select("order_index")
        .eq("speaker_id", transcript.speaker_id)
        .order("order_index", { ascending: false })
        .limit(1);

      let nextOrder = (existingCatsForOrder?.[0]?.order_index ?? -1) + 1;

      for (const catName of allNewCats) {
        await supabase
          .from("speaker_categories")
          .upsert(
            { speaker_id: transcript.speaker_id, name: catName, status: "pending", order_index: nextOrder },
            { onConflict: "speaker_id,name" }
          );
        nextOrder++;
      }
    }

    // Resolve category IDs for ALL categories (including newly inserted pending ones)
    const categoryIdMap = new Map<string, string>();
    if (transcript.speaker_id) {
      const { data: allCats } = await supabase
        .from("speaker_categories")
        .select("id, name")
        .eq("speaker_id", transcript.speaker_id);
      for (const c of allCats ?? []) {
        categoryIdMap.set(c.name.toLowerCase(), c.id);
      }
    }

    // Insert sections and assign segments
    for (let i = 0; i < result.sections.length; i++) {
      const sec = result.sections[i];
      const catId = categoryIdMap.get(sec.category?.toLowerCase() ?? "") || null;

      const { data: inserted, error: insertError } = await supabase
        .from("transcript_sections")
        .insert({
          transcript_id: id,
          title: sec.title,
          description: sec.description || null,
          section_type: sec.section_type || "remarks",
          category_id: catId,
          category_name: sec.category || null,
          order_index: i,
        })
        .select()
        .single();

      if (insertError || !inserted) {
        console.error(`[sections] Failed to insert section ${i}:`, insertError);
        continue;
      }

      // Assign segments to this section
      if (sec.segment_indices && sec.segment_indices.length > 0) {
        const segmentIds = sec.segment_indices
          .map((idx) => segments[idx]?.id)
          .filter(Boolean);

        if (segmentIds.length > 0) {
          await supabase
            .from("transcript_segments")
            .update({ section_id: inserted.id })
            .in("id", segmentIds);
        }
      }
    }

    // Update transcript status
    await supabase
      .from("transcripts")
      .update({
        sectioning_status: "sectioned",
        sectioned_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Fetch final state
    const { data: savedSections } = await supabase
      .from("transcript_sections")
      .select("*")
      .eq("transcript_id", id)
      .order("order_index");

    const { data: updatedSegments } = await supabase
      .from("transcript_segments")
      .select("*")
      .eq("transcript_id", id)
      .order("order_index");

    return NextResponse.json({
      sections: savedSections ?? [],
      segments: updatedSegments ?? [],
      newCategories: allNewCats,
      status: "sectioned",
    });
  } catch (err) {
    console.error("[sections] AI sectioning failed:", err);
    await supabase
      .from("transcripts")
      .update({ sectioning_status: "pending" })
      .eq("id", id);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sectioning failed" },
      { status: 500 }
    );
  }
}

// PATCH — approve or adjust sections
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { action, sections: sectionUpdates, approvedCategories, rejectedCategories } = body;

  const supabase = getServerSupabase();

  if (action === "adjust" && Array.isArray(sectionUpdates)) {
    for (const sec of sectionUpdates) {
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (sec.title !== undefined) update.title = sec.title;
      if (sec.description !== undefined) update.description = sec.description;
      if (sec.section_type !== undefined) update.section_type = sec.section_type;
      if (sec.category_name !== undefined) update.category_name = sec.category_name;
      if (sec.category_id !== undefined) update.category_id = sec.category_id;

      await supabase
        .from("transcript_sections")
        .update(update)
        .eq("id", sec.id);

      // Reassign segments if provided
      if (Array.isArray(sec.segment_ids)) {
        await supabase
          .from("transcript_segments")
          .update({ section_id: null })
          .eq("section_id", sec.id);

        if (sec.segment_ids.length > 0) {
          await supabase
            .from("transcript_segments")
            .update({ section_id: sec.id })
            .in("id", sec.segment_ids);
        }
      }
    }

    return NextResponse.json({ success: true });
  }

  if (action === "approve") {
    // Get transcript to find speaker_id
    const { data: transcript } = await supabase
      .from("transcripts")
      .select("speaker_id")
      .eq("id", id)
      .single();

    const speakerId = transcript?.speaker_id;

    // Approve pending categories — set status to 'approved'
    if (speakerId && Array.isArray(approvedCategories) && approvedCategories.length > 0) {
      for (const catName of approvedCategories) {
        await supabase
          .from("speaker_categories")
          .update({ status: "approved" })
          .eq("speaker_id", speakerId)
          .eq("name", catName);
      }

      // Trigger retro-classification for other transcripts of this speaker
      const { data: otherTranscripts } = await supabase
        .from("transcripts")
        .select("id")
        .eq("speaker_id", speakerId)
        .eq("sectioning_status", "approved")
        .neq("id", id);

      if (otherTranscripts && otherTranscripts.length > 0) {
        const otherIds = otherTranscripts.map((t) => t.id);
        await supabase
          .from("transcripts")
          .update({
            needs_review: true,
            review_reason: `New categories added: ${approvedCategories.join(", ")}. Sections may need re-classification.`,
          })
          .in("id", otherIds);
      }
    }

    // Reject pending categories — delete from speaker_categories, clear from sections
    if (speakerId && Array.isArray(rejectedCategories) && rejectedCategories.length > 0) {
      for (const catName of rejectedCategories) {
        // Clear category from any sections using it
        await supabase
          .from("transcript_sections")
          .update({ category_name: null, category_id: null })
          .eq("transcript_id", id)
          .eq("category_name", catName);

        // Delete the pending category
        await supabase
          .from("speaker_categories")
          .delete()
          .eq("speaker_id", speakerId)
          .eq("name", catName)
          .eq("status", "pending");
      }
    }

    await supabase
      .from("transcripts")
      .update({
        sectioning_status: "approved",
        sectioned_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ success: true, sectioningStatus: "approved" });
  }

  return NextResponse.json({ error: "Invalid action. Use 'approve' or 'adjust'" }, { status: 400 });
}
