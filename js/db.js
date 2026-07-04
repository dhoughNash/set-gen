/**
 * db.js — Supabase storage layer for Set List Developer
 *
 * Songs live in Supabase (permanent, cross-device).
 * Saved setlists live in Supabase (permanent, named, reloadable).
 * The active working setlist lives in localStorage (ephemeral).
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL      = 'https://drqprlrsvoaulsfqnmug.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3TkViJg9X18WLl5Bdn7wxQ_Izid6RqX';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SETLIST_KEY = 'setlist-dev-setlist-v1';

/* ── SONGS ─────────────────────────────────────────────────────── */

export async function loadSongs() {
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .order('title', { ascending: true });
  if (error) { console.error('loadSongs error:', error.message); return []; }
  return data;
}

export async function upsertSong(song) {
  const { error } = await supabase.from('songs').upsert(song, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function deleteSongDb(id) {
  const { error } = await supabase.from('songs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── SAVED SETLISTS ─────────────────────────────────────────────── */

export async function loadSavedSetlists() {
  const { data, error } = await supabase
    .from('setlists')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('loadSavedSetlists error:', error.message); return []; }
  return data;
}

export async function saveSetlistDb(name, items, show, date) {
  const record = {
    id: 's' + Date.now() + Math.floor(Math.random() * 999),
    name,
    show,
    date,
    items: JSON.stringify(items)
  };
  const { error } = await supabase.from('setlists').insert(record);
  if (error) throw new Error(error.message);
  return record;
}

export async function deleteSetlistDb(id) {
  const { error } = await supabase.from('setlists').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── ACTIVE SETLIST (localStorage) ──────────────────────────────── */

export function loadSetlist() {
  try { return JSON.parse(localStorage.getItem(SETLIST_KEY)) || []; }
  catch { return []; }
}

export function saveSetlist(setlist) {
  localStorage.setItem(SETLIST_KEY, JSON.stringify(setlist));
}
