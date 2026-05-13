export interface VideoResponse {
  id: string;
  athleteId: string;
  clubId: string;
  r2Key: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  order: number;
  uploadedAt: string;
}

export class VideoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly error?: string,
  ) {
    super(message);
    this.name = "VideoApiError";
  }
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export async function fetchVideos(
  athleteId: string,
  token: string,
): Promise<VideoResponse[]> {
  const res = await fetch(`${API_BASE}/api/athletes/${athleteId}/videos`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new VideoApiError(
      body.message ?? `HTTP ${res.status}`,
      res.status,
      body.error,
    );
  }
  return res.json() as Promise<VideoResponse[]>;
}

export function uploadVideo(
  athleteId: string,
  file: File,
  token: string,
  onProgress: (pct: number) => void,
): Promise<VideoResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("video", file);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 201) {
        resolve(JSON.parse(xhr.responseText) as VideoResponse);
      } else {
        const body = JSON.parse(xhr.responseText) as { message?: string };
        reject(
          new VideoApiError(body.message ?? `HTTP ${xhr.status}`, xhr.status),
        );
      }
    };

    xhr.onerror = () => reject(new VideoApiError("Falha na conexão.", 0));

    xhr.open("POST", `${API_BASE}/api/athletes/${athleteId}/videos`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}

export async function deleteVideo(
  athleteId: string,
  videoId: string,
  token: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/athletes/${athleteId}/videos/${videoId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    },
  );
  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new VideoApiError(body.message ?? `HTTP ${res.status}`, res.status);
  }
}

export async function reorderVideos(
  athleteId: string,
  orderedIds: string[],
  token: string,
): Promise<VideoResponse[]> {
  const res = await fetch(
    `${API_BASE}/api/athletes/${athleteId}/videos/reorder`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify({ orderedIds }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new VideoApiError(body.message ?? `HTTP ${res.status}`, res.status);
  }
  return res.json() as Promise<VideoResponse[]>;
}
