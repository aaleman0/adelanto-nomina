export function LetterWave({ children }: { children: string }) {
  return (
    <span className="letter-wave" aria-label={children}>
      {Array.from(children).map((letter, index) => (
        <span aria-hidden="true" key={`${letter}-${index}`} style={{ "--letter-index": index } as React.CSSProperties}>
          {letter}
        </span>
      ))}
    </span>
  );
}
