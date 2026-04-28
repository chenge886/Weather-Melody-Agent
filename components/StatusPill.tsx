import type { AgentState } from "@/lib/types";

const STATE_LABEL: Record<AgentState, string> = {
  idle: "待机",
  listening: "聆听中",
  thinking: "思考中",
  speaking: "回复中"
};

interface StatusPillProps {
  state: AgentState;
  realtimeStatus: "unknown" | "ready" | "fallback";
}

export function StatusPill({ state, realtimeStatus }: StatusPillProps) {
  return (
    <div className="status-pill-wrap">
      <span className={`status-pill ${state}`}>{STATE_LABEL[state]}</span>
      <span className={`realtime-pill ${realtimeStatus}`}>
        {realtimeStatus === "ready" ? "Realtime 已连接" : realtimeStatus === "fallback" ? "Fallback 模式" : "Realtime 初始化"}
      </span>
    </div>
  );
}
