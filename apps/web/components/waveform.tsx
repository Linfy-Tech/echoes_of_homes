export function Waveform({ active = false }: { active?: boolean }) {
  return <div className={`waveform ${active ? 'is-active' : ''}`} aria-hidden="true">
    <svg viewBox="0 0 240 72" preserveAspectRatio="none" fill="none">
      {[12, 25, 36, 20, 47, 30, 58, 42, 27, 50, 34, 22, 45, 31, 54, 24, 39, 18].map((height, index) => <rect key={index} className="waveform-bar" x={index * 13 + 2} y={(72 - height) / 2} width="7" height={height} rx="3.5" />)}
    </svg>
  </div>;
}
