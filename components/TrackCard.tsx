import type { TrackCard } from "@/lib/types";

interface TrackCardProps {
  track: TrackCard;
}

export function TrackCardView({ track }: TrackCardProps) {
  return (
    <article className="track-card">
      <div className="track-main">
        <h3>{track.title}</h3>
        <p className="track-artist">{track.artist}</p>
        {track.album ? <p className="track-album">专辑：{track.album}</p> : null}
        <p className="track-reason">{track.reason}</p>
      </div>
      <a className="track-link" href={track.deepLink} target="_blank" rel="noreferrer">
        去网易云
      </a>
    </article>
  );
}
