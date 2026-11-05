import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveBase64File, saveTextFile } from "../../../services/files/share";

const native = vi.hoisted(() => ({
  platform: { OS: "ios" },
  available: vi.fn<() => Promise<boolean>>(),
  share: vi.fn<(uri: string, options: unknown) => Promise<void>>(),
  writes: [] as { uri: string; content: string; encoding: string }[],
  removed: [] as string[],
  previous: [] as { name: string; delete: () => void }[],
  failWrite: false,
}));

vi.mock("react-native", () => ({ Platform: native.platform, Share: { share: vi.fn() } }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: native.available, shareAsync: native.share }));
vi.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    exists = true;
    constructor(parent: string | Directory, name: string) {
      this.uri = `${typeof parent === "string" ? parent : parent.uri}/${name}`;
    }
    create() {}
    list() {
      return native.previous;
    }
    delete() {
      native.removed.push(this.uri);
    }
  }
  class File {
    uri: string;
    constructor(parent: Directory, name: string) {
      this.uri = `${parent.uri}/${name}`;
    }
    create() {}
    write(content: string, options: { encoding: string }) {
      if (native.failWrite) throw new Error("disk full");
      native.writes.push({ uri: this.uri, content, encoding: options.encoding });
      return Promise.resolve();
    }
  }
  return { Directory, File, Paths: { cache: "file:///private/cache" } };
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
  native.platform.OS = "ios";
  native.available.mockReset().mockResolvedValue(true);
  native.share.mockReset().mockResolvedValue();
  native.writes.length = 0;
  native.removed.length = 0;
  native.previous.length = 0;
  native.failWrite = false;
});

function firstWrite() {
  const written = native.writes[0];
  if (!written) throw new Error("Expected a file attachment to be written");
  return written;
}

describe("native export attachments", () => {
  it.each(["ios", "android"])("shares XLSX bytes, not just the filename, on %s", async (os) => {
    native.platform.OS = os;
    const bytes = new Uint8Array([0x50, 0x4b, 3, 4, 0, 255, 128]);
    await saveBase64File(
      "payroll.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      btoa(String.fromCharCode(...bytes)),
    );
    const written = firstWrite();
    expect(written.encoding).toBe("base64");
    expect(Uint8Array.from(atob(written.content), (char) => char.charCodeAt(0))).toEqual(bytes);
    expect(native.share).toHaveBeenCalledWith(
      written.uri,
      expect.objectContaining({
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    expect(written.uri).toMatch(/^file:\/\/\/private\/cache\/gugu-exports\/\d+-\d+\/payroll.xlsx$/);
    expect(native.removed).toEqual([]); // Android may consume the URI after the chooser closes.
  });

  it("preserves Vietnamese CSV content and attaches the file", async () => {
    const content = "Tên,Lương\nNguyễn Thị Mai,150000\n";
    await saveTextFile("payroll.csv", "text/csv", content);
    expect(native.writes[0]).toMatchObject({ content, encoding: "utf8" });
    expect(native.share).toHaveBeenCalledWith(firstWrite().uri, {
      mimeType: "text/csv",
      dialogTitle: "payroll.csv",
    });
  });

  it("does not write files when sharing is unavailable and permits a retry", async () => {
    native.available.mockResolvedValueOnce(false);
    await expect(saveTextFile("clients.json", "application/json", "{}")).rejects.toThrow(
      "files.sharing_unavailable",
    );
    expect(native.writes).toEqual([]);
    await expect(saveTextFile("clients.json", "application/json", "{}")).resolves.toBeUndefined();
  });

  it.each(["write", "share"])("removes partial private exports after %s failure", async (stage) => {
    if (stage === "write") native.failWrite = true;
    else native.share.mockRejectedValueOnce(new Error("share failed"));
    await expect(saveTextFile("clients.txt", "text/plain", "private content")).rejects.toThrow();
    expect(native.removed).toHaveLength(1);
    if (stage === "write") expect(native.share).not.toHaveBeenCalled();
  });

  it("prunes expired cache entries without deleting a recent receiving app's attachment", async () => {
    const expired = vi.fn();
    const recent = vi.fn();
    native.previous.push(
      { name: "1799900000000-1", delete: expired },
      { name: "1800000000000-1", delete: recent },
    );
    await saveTextFile("report.csv", "text/csv", "data");
    expect(expired).toHaveBeenCalledOnce();
    expect(recent).not.toHaveBeenCalled();
  });

  it("keeps malformed filenames inside the private cache", async () => {
    await saveTextFile("../../clients.json", "application/json", "{}");
    expect(firstWrite().uri).not.toContain("..");
    expect(firstWrite().uri).toMatch(/\/clients\.json$/);
  });
});
