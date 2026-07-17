import { z } from 'zod';
import { EffectSchema } from './scenario.js';

export const SubtitleStyleSchema = z.object({
  fontSize: z.number().int().positive().optional(),
  color: z.string().optional(),
  bgColor: z.string().optional(),
  position: z.enum(['top', 'middle', 'bottom']).optional(),
});

export const VideoTrackSchema = z.object({
  type: z.literal('video'),
  id: z.string(),
  sceneId: z.string(),
  src: z.string(),
  startTime: z.number().nonnegative(),
  endTime: z.number().positive(),
  trimStart: z.number().nonnegative().optional(),
  trimEnd: z.number().positive().optional(),
  speed: z.number().positive().optional(),
});

export const AudioTrackSchema = z.object({
  type: z.literal('audio'),
  id: z.string(),
  sceneId: z.string(),
  src: z.string(),
  startTime: z.number().nonnegative(),
  endTime: z.number().positive(),
  volume: z.number().min(0).max(1).optional(),
});

export const SubtitleTrackSchema = z.object({
  type: z.literal('subtitle'),
  id: z.string(),
  sceneId: z.string(),
  text: z.string(),
  startTime: z.number().nonnegative(),
  endTime: z.number().positive(),
  style: SubtitleStyleSchema.optional(),
});

export const EffectTrackSchema = z.object({
  type: z.literal('effect'),
  id: z.string(),
  effect: EffectSchema,
  startTime: z.number().nonnegative(),
  endTime: z.number().positive(),
});

export const TrackSchema = z.discriminatedUnion('type', [
  VideoTrackSchema,
  AudioTrackSchema,
  SubtitleTrackSchema,
  EffectTrackSchema,
]);

export const TimelineMetaSchema = z.object({
  totalDuration: z.number().positive(),
  resolution: z.string(),
  fps: z.union([z.literal(30), z.literal(60)]),
  generatedAt: z.string().default(() => new Date().toISOString()),
});

export const TimelineSchema = z.object({
  meta: TimelineMetaSchema,
  tracks: z.array(TrackSchema),
});

export type SubtitleStyle = z.infer<typeof SubtitleStyleSchema>;
export type VideoTrack = z.infer<typeof VideoTrackSchema>;
export type AudioTrack = z.infer<typeof AudioTrackSchema>;
export type SubtitleTrack = z.infer<typeof SubtitleTrackSchema>;
export type EffectTrack = z.infer<typeof EffectTrackSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type TimelineMeta = z.infer<typeof TimelineMetaSchema>;
export type Timeline = z.infer<typeof TimelineSchema>;
