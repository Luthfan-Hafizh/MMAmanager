// Minimal Node globals for the check scripts (they are bundled and run by Node).
declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  stdout: { write(s: string): boolean };
};
