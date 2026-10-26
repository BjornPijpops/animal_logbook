"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deletePhotoAction, setPrimaryPhotoAction } from "../server/actions";

export type PhotoView = { id: string; fileId: string; thumbFileId: string; isPrimary: boolean };

type Props = { animalId: string; photos: PhotoView[]; canWrite: boolean };

export function PhotoManager({ animalId, photos, canWrite }: Props) {
  const t = useTranslations("animals.photos");
  const ta = useTranslations("animals");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("photo", file);
      const response = await fetch(`/api/animals/${animalId}/photos`, {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      if (!response.ok) {
        setError(response.status === 400 ? t("uploadFailed") : ta("errors.validation"));
        return;
      }
      router.refresh();
    } catch {
      setError(t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  function run(action: () => Promise<{ ok: boolean }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(ta("errors.validation"));
      else router.refresh();
    });
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {error ? <Alert tone="error">{error}</Alert> : null}

      {photos.length === 0 ? <p className="text-muted-foreground text-sm">{t("empty")}</p> : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, index) => {
          const n = index + 1;
          return (
            <li key={photo.id} className="border-border space-y-2 rounded-lg border p-2">
              <a
                href={`/api/files/${photo.fileId}`}
                target="_blank"
                rel="noreferrer"
                aria-label={t("open", { n })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin thumbnails */}
                <img
                  src={`/api/files/${photo.thumbFileId}`}
                  alt={t("alt", { n })}
                  width={320}
                  height={320}
                  loading="lazy"
                  className="aspect-square w-full rounded-md object-cover"
                />
              </a>
              {photo.isPrimary ? (
                <p className="text-sm font-medium">{t("primary")}</p>
              ) : canWrite ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={pending}
                  onClick={() => run(() => setPrimaryPhotoAction(animalId, photo.id))}
                >
                  {t("makePrimary", { n })}
                </Button>
              ) : null}
              {canWrite ? (
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(t("deleteConfirm"))) {
                      run(() => deletePhotoAction(animalId, photo.id));
                    }
                  }}
                >
                  {t("delete", { n })}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {canWrite ? (
        <div className="space-y-1.5">
          <label htmlFor="photo-upload" className="block text-sm font-medium">
            {uploading ? t("uploading") : t("upload")}
          </label>
          <input
            id="photo-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            aria-describedby="photo-upload-hint"
            className="block w-full text-sm"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void upload(file);
            }}
          />
          <p id="photo-upload-hint" className="text-muted-foreground text-sm">
            {t("hint")}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
