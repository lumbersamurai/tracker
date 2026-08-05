import MoltenMetal from './MoltenMetal';

export default function AppBackground({ theme }) {
  const isDark = theme === 'dark';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: -1, backgroundColor: isDark ? '#0B0914' : '#F2F2F7' }}>
      <MoltenMetal
        color1={isDark ? '#0a0514' : '#5227FF'} color2={isDark ? '#2b1055' : '#FF9FFC'} color3={isDark ? '#9d7fe8' : '#FFFFFF'}
        speed={isDark ? 0.2 : 0.35} scale={isDark ? 5 : 4} detail={3} glow={isDark ? 0.8 : 1.6} coreSize={isDark ? 0.05 : 0.1}
        swirl={1} fold={-0.2} blackPoint={isDark ? 0.3 : 0.05} brightness={isDark ? 0.9 : 1.3} colorMode="molten"
        grain grainIntensity={0.05} mouseInteraction mouseStrength={0.3} opacity={isDark ? 0.85 : 1}
      />
    </div>
  );
}
