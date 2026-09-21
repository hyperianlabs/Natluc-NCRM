// ============================================================
// find-leads — Supabase Edge Function
//
// Searches Google Places for engineering/manufacturing/mining
// businesses across South Africa that fit Natluc's customer
// profile (machine shops, toolrooms, fabricators, mine
// maintenance workshops, etc.) and stores new ones in the
// `leads` table for staff to review in the CRM.
//
// Deployed via Supabase Dashboard -> Edge Functions.
// Requires one secret: GOOGLE_PLACES_API_KEY
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided
// automatically by Supabase — no need to set those yourself.)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Core categories of business that fit Natluc's customer profile:
// buyers of precision cutting tools, measuring instruments, PPE and hand tools.
const SEARCH_TERMS = [
  'CNC machining',
  'precision engineering',
  'machine shop',
  'metal fabrication',
  'engineering workshop',
  'mining equipment repair',
];

// Major industrial / mining hubs used for national sweeps.
// Kept deliberately short so a single run stays fast and cheap —
// repeated (e.g. weekly) runs build up coverage over time.
const NATIONAL_LOCATIONS = [
  'Johannesburg', 'Pretoria', 'Durban', 'Cape Town',
  'Gqeberha', 'Bloemfontein', 'Rustenburg', 'eMalahleni',
];

const DEFAULT_LOCAL_LOCATION = 'Johannesburg';

// Caps how many raw results per search we bother processing —
// keeps runs fast and API usage predictable.
const NATIONAL_MAX_PER_QUERY = 5;
const LOCAL_MAX_PER_QUERY = 8;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!GOOGLE_API_KEY) {
      return json({ error: 'GOOGLE_PLACES_API_KEY is not configured as a function secret.' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const scope = body.scope === 'national' ? 'national' : 'local';
    const keyword = (body.keyword || '').trim();
    const localLocation = (body.location || '').trim() || DEFAULT_LOCAL_LOCATION;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const terms = keyword ? [keyword] : SEARCH_TERMS;
    const locations = scope === 'national' ? NATIONAL_LOCATIONS : [localLocation];
    const maxPerQuery = scope === 'national' ? NATIONAL_MAX_PER_QUERY : LOCAL_MAX_PER_QUERY;

    let searched = 0, found = 0, inserted = 0, skipped = 0;

    for (const location of locations) {
      for (const term of terms) {
        searched++;
        const query = `${term} in ${location}, South Africa`;
        const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}`;

        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
          console.error('Places search error:', searchData.status, searchData.error_message);
          continue;
        }

        const results = (searchData.results || []).slice(0, maxPerQuery);

        for (const place of results) {
          found++;

          // Skip if we already have this place — avoids paying for a
          // Details call (which costs more than a search) on repeats.
          const { data: existing } = await supabase
            .from('leads')
            .select('id')
            .eq('place_id', place.place_id)
            .maybeSingle();

          if (existing) {
            await supabase.from('leads').update({ last_seen: new Date().toISOString() }).eq('id', existing.id);
            skipped++;
            continue;
          }

          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website&key=${GOOGLE_API_KEY}`;
          const detailsRes = await fetch(detailsUrl);
          const detailsData = await detailsRes.json();
          const d = detailsData.result || {};

          const { error: insertError } = await supabase.from('leads').insert([{
            place_id: place.place_id,
            name: d.name || place.name,
            address: d.formatted_address || place.formatted_address,
            phone: d.formatted_phone_number || null,
            website: d.website || null,
            matched_category: term,
            search_location: location,
            status: 'new',
          }]);

          if (insertError) {
            console.error('Insert error:', insertError.message);
          } else {
            inserted++;
          }
        }
      }
    }

    return json({ scope, searched, found, inserted, skipped });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
