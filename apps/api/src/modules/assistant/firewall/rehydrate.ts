import { ENTITY_TOKEN_SCAN_RE } from "@gugu/contracts";

/**
 * Output side of the PII firewall (spec 08 §4.3 step 5): replaces tokens in the model's streamed
 * text with display names for the viewer. Streams arrive in arbitrary pieces, so a trailing word
 * that could still become a token ("staf", "staff_1") is held back until the next piece or flush.
 * Runs only on what is sent to the signed-in CRM user, never on anything sent back to a model.
 */
export class StreamRehydrator {
  private buffer = "";

  constructor(private readonly display: (token: string) => string | undefined) {}

  push(piece: string): string {
    this.buffer += piece;
    const hold = /[A-Za-z0-9_]+$/.exec(this.buffer);
    const cut = hold ? hold.index : this.buffer.length;
    const ready = this.buffer.slice(0, cut);
    this.buffer = this.buffer.slice(cut);
    return this.replace(ready);
  }

  flush(): string {
    const rest = this.buffer;
    this.buffer = "";
    return this.replace(rest);
  }

  private replace(text: string): string {
    return text.replace(ENTITY_TOKEN_SCAN_RE, (token) => this.display(token) ?? token);
  }
}
