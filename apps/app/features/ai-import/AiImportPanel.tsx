import { useEffect, useRef, useState } from "react";

import type { AiImportExtractResult } from "@gugu/contracts";
import { toReviewRows } from "@gugu/domain";

import { type PickedImage, pickImages, useAiImportStatus, useExtract } from "./data";
import { ImportBanner } from "./ImportBanner";
import { PickedStage } from "./PickedStage";
import { ReviewStage } from "./ReviewStage";

type Stage =
  | { kind: "idle" }
  | { kind: "picked"; images: PickedImage[] }
  | { kind: "review"; result: AiImportExtractResult }
  | { kind: "done"; created: number };

/**
 * "Effortless AI setup" (topic 08 IMP, every plan): pick price-list photos → server redacts and
 * reads them → owner reviews the rows → services are created. Lives at the top of Services and opens
 * straight into the picker when Today's setup card links here (`?import=1`).
 */
export function AiImportPanel({ highlight, autoPick }: { highlight: boolean; autoPick: boolean }) {
  const status = useAiImportStatus();
  const extract = useExtract();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [pickError, setPickError] = useState(false);
  const autoPicked = useRef(false);
  const available = status.data?.configured === true && status.data.entitled;

  const choose = async (existing: PickedImage[]) => {
    setPickError(false);
    try {
      const more = await pickImages(existing.length);
      if (more.length || existing.length) {
        setStage({ kind: "picked", images: [...existing, ...more] });
      }
    } catch {
      setPickError(true);
    }
  };

  useEffect(() => {
    if (autoPick && available && !autoPicked.current && stage.kind === "idle") {
      autoPicked.current = true;
      void choose([]);
    }
  }, [autoPick, available, stage.kind]);

  const reset = () => {
    extract.reset();
    setStage({ kind: "idle" });
  };

  if (stage.kind === "picked") {
    return (
      <PickedStage
        images={stage.images}
        reading={extract.isPending}
        error={extract.error}
        onRemove={(i) => {
          const images = stage.images.filter((_, j) => j !== i);
          setStage(images.length ? { kind: "picked", images } : { kind: "idle" });
        }}
        onAddMore={() => {
          void choose(stage.images);
        }}
        onRead={() => {
          extract.mutate(stage.images, {
            onSuccess: (result) => {
              setStage({ kind: "review", result });
            },
          });
        }}
        onCancel={reset}
      />
    );
  }
  if (stage.kind === "review") {
    return (
      <ReviewStage
        result={stage.result}
        initialRows={toReviewRows(stage.result.items)}
        onDone={(created) => {
          setStage({ kind: "done", created });
        }}
        onStartOver={reset}
      />
    );
  }
  return (
    <ImportBanner
      status={status.data}
      loading={status.isPending}
      highlight={highlight}
      created={stage.kind === "done" ? stage.created : null}
      pickFailed={pickError}
      onPick={() => {
        void choose([]);
      }}
    />
  );
}
