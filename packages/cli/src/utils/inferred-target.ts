import type { DvgConfig, ProjectSummary } from '@demo-video-gen/core';
import { logger } from '@demo-video-gen/core';

/** Adopt only loopback ready URLs produced by source analysis. */
export function applyInferredTargetUrl(config: DvgConfig, summary: ProjectSummary): boolean {
  if (!config.target.autoDetectUrl || summary.platform !== 'web') return false;
  const candidate = summary.setupSteps.find((step) => step.background)?.readyUrl;
  if (!candidate || !isLoopbackUrl(candidate)) {
    logger.warn(`Could not infer a safe local target URL; keeping ${config.target.url}.`);
    return false;
  }
  config.target.url = candidate;
  config.target.autoDetectUrl = false;
  logger.success(`Detected local target URL: ${candidate}`);
  return true;
}

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}
