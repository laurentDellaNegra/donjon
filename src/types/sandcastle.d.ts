declare module "@ai-hero/sandcastle" {
  export const run: (...args: any[]) => any;
  export const createSandbox: (...args: any[]) => any;
  export const claudeCode: (...args: any[]) => any;
  export const openai: (...args: any[]) => any;
  export const gemini: (...args: any[]) => any;
  export const codex: (...args: any[]) => any;
  export const __unknown: any;
}

declare module "@ai-hero/sandcastle/sandboxes/docker" {
  export const docker: (...args: any[]) => any;
}

declare module "@ai-hero/sandcastle/sandboxes/podman" {
  export const podman: (...args: any[]) => any;
}

declare module "@ai-hero/sandcastle/sandboxes/vercel" {
  export const vercel: (...args: any[]) => any;
}

declare module "@ai-hero/sandcastle/sandboxes/daytona" {
  export const daytona: (...args: any[]) => any;
}
