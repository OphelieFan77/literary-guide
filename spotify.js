export async function searchTrack(title, artist, accessToken) {
  const q = encodeURIComponent(`${artist} ${title}`);
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const track = data.tracks?.items?.[0];
  if (!track) return null;
  return {
    uri: track.uri,
    name: track.name,
    artist: track.artists[0]?.name,
    albumArt: track.album.images[0]?.url,
    previewUrl: track.preview_url,
  };
}
