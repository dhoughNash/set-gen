/**
 * db.js — Supabase storage layer for Set List Developer
 *
 * Songs live in Supabase (permanent, cross-device).
 * The active setlist lives in localStorage (ephemeral working state —
 * it's just the current generated order, not worth persisting to the DB).
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SETLIST_KEY = 'setlist-dev-setlist-v1';

/* ── SONGS ─────────────────────────────────────────────────────── */

export async function loadSongs() {
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .order('title', { ascending: true });

  if (error) {
    console.error('loadSongs error:', error.message);
    return [];
  }
  return data;
}

export async function upsertSong(song) {
  const { error } = await supabase
    .from('songs')
    .upsert(song, { onConflict: 'id' });

  if (error) throw new Error(error.message);
}

export async function deleteSong(id) {
  const { error } = await supabase
    .from('songs')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/* ── SETLIST (localStorage) ─────────────────────────────────────── */

export function loadSetlist() {
  try {
    return JSON.parse(localStorage.getItem(SETLIST_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveSetlist(setlist) {
  localStorage.setItem(SETLIST_KEY, JSON.stringify(setlist));
}
