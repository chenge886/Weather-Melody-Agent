import type { AgentState } from "@/lib/types";

interface VoiceOrbProps {
  state: AgentState;
  level: number;
}

export function VoiceOrb({ state, level }: VoiceOrbProps) {
  const clampedLevel = Math.max(0, Math.min(level, 1));
  const scale = 1 + clampedLevel * 0.16;

  return (
    <div className={`voice-orb ${state}`} style={{ transform: `scale(${scale})` }}>
      <span className="voice-orb-core" />
      <span className="voice-orb-ring ring-a" />
      <span className="voice-orb-ring ring-b" />
      <span className="voice-orb-ring ring-c" />
    </div>
  );
}
