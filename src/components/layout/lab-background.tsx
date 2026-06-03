export function LabBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 opacity-[0.35]"
      style={{
        backgroundImage: `
            radial-gradient(circle at 20% 0%, rgba(26, 86, 50, 0.06) 0%, transparent 45%),
            radial-gradient(circle at 80% 100%, rgba(26, 86, 50, 0.04) 0%, transparent 40%),
            linear-gradient(to bottom, #f6f5f1, #faf9f6)
          `,
      }}
    />
  );
}
