import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchVideos,
  deleteVideo,
  reorderVideos,
  type VideoResponse,
} from "@/lib/api/videos";

export const videosQueryKey = (athleteId: string) =>
  ["videos", athleteId] as const;

export function useVideos(athleteId: string) {
  const { getAccessToken } = useAuth();
  return useQuery({
    queryKey: videosQueryKey(athleteId),
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchVideos(athleteId, token);
    },
    staleTime: 30_000,
  });
}

export function useDeleteVideo(athleteId: string) {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (videoId: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return deleteVideo(athleteId, videoId, token);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: videosQueryKey(athleteId) }),
  });
}

export function useReorderVideos(athleteId: string) {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return reorderVideos(athleteId, orderedIds, token);
    },
    onSuccess: (data) =>
      qc.setQueryData<VideoResponse[]>(videosQueryKey(athleteId), data),
  });
}
