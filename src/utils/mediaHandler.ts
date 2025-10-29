/**
 * MediaHandler - Handles image processing for SubQuest story content
 * Fetches external images and rehosts them through Devvit's media API
 */

import { Devvit } from '@devvit/public-api';

/**
 * Result of image processing operation
 */
export interface ImageProcessResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Reddit media ID if successful, undefined if failed */
  mediaId?: string;
  /** Reddit media URL if successful, undefined if failed */
  mediaUrl?: string;
  /** Original processed URL used for upload */
  originalUrl?: string;
  /** Error message if operation failed */
  error?: string;
}

/**
 * Configuration for image processing
 */
export interface MediaConfig {
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSizeBytes?: number;
  /** Timeout for image fetch in milliseconds (default: 30 seconds) */
  fetchTimeoutMs?: number;
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Supported image formats */
  supportedFormats?: string[];
}

/**
 * MediaHandler class for processing story images
 * Handles fetching external images and uploading them to Devvit's media service
 */
export class MediaHandler {
  private readonly config: Required<MediaConfig>;
  private readonly context: Devvit.Context;

  constructor(context: Devvit.Context, config: MediaConfig = {}) {
    this.context = context;
    this.config = {
      maxFileSizeBytes: config.maxFileSizeBytes ?? 10 * 1024 * 1024, // 10MB
      fetchTimeoutMs: config.fetchTimeoutMs ?? 30000, // 30 seconds
      maxRetries: config.maxRetries ?? 3,
      supportedFormats: config.supportedFormats ?? ['jpg', 'jpeg', 'png', 'gif', 'webp']
    };
  }

  /**
   * Converts Google Drive sharing URLs to direct download URLs
   * @param url The Google Drive sharing URL
   * @returns Direct download URL or original URL if not a Google Drive URL
   */
  private convertGoogleDriveUrl(url: string): string {
    try {
      // Check if it's a Google Drive sharing URL
      const driveSharePattern = /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view/;
      const match = url.match(driveSharePattern);
      
      if (match && match[1]) {
        const fileId = match[1];
        const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        console.log(`[MediaHandler] Converted Google Drive URL: ${url} -> ${directUrl}`);
        return directUrl;
      }
      
      return url;
    } catch (error) {
      console.warn(`[MediaHandler] Error converting Google Drive URL: ${url}`, error);
      return url;
    }
  }

  /**
   * Validates if a URL appears to be a valid image URL
   * @param url The URL to validate
   * @returns True if the URL appears valid for an image
   */
  async validateImageUrl(url: string): Promise<boolean> {
    try {
      // Convert Google Drive URLs first
      const processedUrl = this.convertGoogleDriveUrl(url);
      const urlObj = new URL(processedUrl);
      
      // Check if protocol is http or https
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        console.warn(`[MediaHandler] Invalid protocol for image URL: ${urlObj.protocol}`);
        return false;
      }

      // For Google Drive direct URLs, we know they're valid
      if (processedUrl.includes('drive.google.com/uc?export=download')) {
        return true;
      }

      // Check if URL has a supported image extension
      const pathname = urlObj.pathname.toLowerCase();
      const hasValidExtension = this.config.supportedFormats.some(format => 
        pathname.endsWith(`.${format}`)
      );

      if (!hasValidExtension) {
        console.warn(`[MediaHandler] URL does not have supported image extension: ${pathname}`);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`[MediaHandler] Error validating image URL: ${url}`, error);
      return false;
    }
  }



  /**
   * Uploads image directly to Reddit using media.upload API
   * @param imageUrl The external image URL to upload
   * @returns Promise resolving to the MediaAsset object
   */
  private async uploadToReddit(processedUrl: string): Promise<any> {
    try {
      console.log(`[MediaHandler] Uploading image to Reddit media service: ${processedUrl}`);
      
      // Determine media type based on URL
      const mediaType = this.getMediaType(processedUrl);
      
      // Upload to Reddit using the media API
      const response = await this.context.media.upload({
        url: processedUrl,
        type: mediaType
      });

      console.log(`[MediaHandler] Successfully uploaded image to Reddit: ${response.mediaId}`);
      return response;

    } catch (error) {
      console.error('[MediaHandler] Error uploading image to Reddit:', error);
      throw new Error(`Failed to upload image to Reddit: ${(error as Error).message}`);
    }
  }

  /**
   * Determines the media type for Reddit upload based on URL or filename
   * @param url The image URL or filename
   * @returns Media type for Reddit upload
   */
  private getMediaType(url: string): 'image' | 'gif' | 'video' {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('.gif') || urlLower.includes('gif')) {
      return 'gif';
    } else if (urlLower.includes('.mp4') || urlLower.includes('.webm') || urlLower.includes('video')) {
      return 'video';
    } else {
      return 'image';
    }
  }



  /**
   * Processes an external image URL by uploading directly to Reddit
   * Includes retry logic and comprehensive error handling
   * @param imageUrl The external image URL to process
   * @returns Promise resolving to ImageProcessResult with Reddit media ID
   */
  async fetchAndUploadImage(imageUrl: string): Promise<ImageProcessResult> {
    // Validate URL format first
    const isValidUrl = await this.validateImageUrl(imageUrl);
    if (!isValidUrl) {
      return {
        success: false,
        error: 'Invalid image URL format or unsupported file type'
      };
    }

    let lastError: Error | null = null;

    // Retry logic for uploading to Reddit
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`[MediaHandler] Processing image (attempt ${attempt}/${this.config.maxRetries}): ${imageUrl}`);

        // Convert Google Drive URLs to direct download URLs
        const processedUrl = this.convertGoogleDriveUrl(imageUrl);
        
        // Upload directly to Reddit using media API
        const mediaAsset = await this.uploadToReddit(processedUrl);

        return {
          success: true,
          mediaId: mediaAsset.mediaId,
          mediaUrl: mediaAsset.mediaUrl,
          originalUrl: processedUrl
        };

      } catch (error) {
        lastError = error as Error;
        console.warn(`[MediaHandler] Attempt ${attempt} failed for ${imageUrl}:`, (error as Error).message);

        // If this isn't the last attempt, wait before retrying
        if (attempt < this.config.maxRetries) {
          const delayMs = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
          console.log(`[MediaHandler] Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // All attempts failed
    const errorMessage = `Failed to process image after ${this.config.maxRetries} attempts: ${lastError?.message}`;
    console.error(`[MediaHandler] ${errorMessage}`);

    return {
      success: false,
      error: errorMessage
    };
  }

  /**
   * Processes an image URL with graceful fallback handling
   * Returns the processed media result or null if processing fails
   * @param imageUrl The image URL to process (optional)
   * @returns Promise resolving to ImageProcessResult or null
   */
  async processImageWithFallback(imageUrl?: string): Promise<ImageProcessResult | null> {
    if (!imageUrl) {
      console.log('[MediaHandler] No image URL provided, skipping image processing');
      return null;
    }

    try {
      const result = await this.fetchAndUploadImage(imageUrl);
      
      if (result.success && result.mediaId) {
        return result;
      } else {
        console.warn(`[MediaHandler] Image processing failed: ${result.error}`);
        return null;
      }
    } catch (error) {
      console.error('[MediaHandler] Unexpected error during image processing:', error);
      return null;
    }
  }
}
/**

 * Error types for media processing operations
 */
export enum MediaErrorType {
  INVALID_URL = 'INVALID_URL',
  FETCH_TIMEOUT = 'FETCH_TIMEOUT',
  FETCH_FAILED = 'FETCH_FAILED',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FORMAT = 'INVALID_FORMAT',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Detailed error information for media processing
 */
export interface MediaError {
  type: MediaErrorType;
  message: string;
  originalError?: Error;
  url?: string;
  attempt?: number;
}

/**
 * Enhanced error handler for media processing operations
 */
export class MediaErrorHandler {
  /**
   * Categorizes an error and returns structured error information
   * @param error The original error
   * @param url The URL being processed
   * @param attempt The current attempt number
   * @returns Structured MediaError object
   */
  static categorizeError(error: Error, url?: string, attempt?: number): MediaError {
    let errorType = MediaErrorType.UNKNOWN_ERROR;
    let message = error.message;

    // Categorize based on error message patterns
    if (error.message.includes('timeout') || error.name === 'AbortError') {
      errorType = MediaErrorType.FETCH_TIMEOUT;
      message = 'Image fetch timed out';
    } else if (error.message.includes('too large')) {
      errorType = MediaErrorType.FILE_TOO_LARGE;
      message = 'Image file size exceeds maximum allowed size';
    } else if (error.message.includes('Invalid content type') || error.message.includes('unsupported')) {
      errorType = MediaErrorType.INVALID_FORMAT;
      message = 'Image format is not supported';
    } else if (error.message.includes('HTTP') || error.message.includes('fetch')) {
      errorType = MediaErrorType.FETCH_FAILED;
      message = `Failed to fetch image: ${error.message}`;
    } else if (error.message.includes('upload') || error.message.includes('Devvit')) {
      errorType = MediaErrorType.UPLOAD_FAILED;
      message = 'Failed to upload image to Devvit media service';
    } else if (error.message.includes('Invalid image URL') || error.message.includes('protocol')) {
      errorType = MediaErrorType.INVALID_URL;
      message = 'Invalid or unsupported image URL';
    } else if (error.message.includes('network') || (error as any).code === 'ENOTFOUND') {
      errorType = MediaErrorType.NETWORK_ERROR;
      message = 'Network error while processing image';
    }

    return {
      type: errorType,
      message,
      originalError: error,
      url,
      attempt
    };
  }

  /**
   * Determines if an error is retryable based on its type
   * @param error The MediaError to check
   * @returns True if the error should be retried
   */
  static isRetryableError(error: MediaError): boolean {
    const retryableTypes = [
      MediaErrorType.FETCH_TIMEOUT,
      MediaErrorType.FETCH_FAILED,
      MediaErrorType.NETWORK_ERROR,
      MediaErrorType.UPLOAD_FAILED
    ];

    return retryableTypes.includes(error.type);
  }

  /**
   * Gets a user-friendly error message for logging or display
   * @param error The MediaError
   * @returns User-friendly error message
   */
  static getUserFriendlyMessage(error: MediaError): string {
    switch (error.type) {
      case MediaErrorType.INVALID_URL:
        return 'The image URL is invalid or uses an unsupported format';
      case MediaErrorType.FETCH_TIMEOUT:
        return 'The image took too long to download';
      case MediaErrorType.FILE_TOO_LARGE:
        return 'The image file is too large';
      case MediaErrorType.INVALID_FORMAT:
        return 'The image format is not supported';
      case MediaErrorType.NETWORK_ERROR:
        return 'Network connection issue while downloading image';
      case MediaErrorType.UPLOAD_FAILED:
        return 'Failed to process image for Reddit';
      case MediaErrorType.FETCH_FAILED:
        return 'Could not download the image from the provided URL';
      default:
        return 'An unexpected error occurred while processing the image';
    }
  }
}

/**
 * Enhanced MediaHandler with improved error handling and fallback strategies
 */
export class EnhancedMediaHandler extends MediaHandler {
  /**
   * Processes an image with comprehensive error handling and fallback options
   * @param imageUrl The image URL to process
   * @param fallbackOptions Options for fallback behavior
   * @returns Promise resolving to processing result with detailed error info
   */
  async processImageWithDetailedFallback(
    imageUrl: string,
    fallbackOptions: {
      logErrors?: boolean;
      includeErrorDetails?: boolean;
    } = {}
  ): Promise<ImageProcessResult & { errorDetails?: MediaError }> {
    const { logErrors = true, includeErrorDetails = false } = fallbackOptions;

    try {
      const result = await this.fetchAndUploadImage(imageUrl);
      
      if (result.success) {
        if (logErrors) {
          console.log(`[MediaHandler] Successfully processed image: ${imageUrl}`);
        }
        return result;
      } else {
        // Create structured error from the basic error message
        const mediaError = MediaErrorHandler.categorizeError(
          new Error(result.error || 'Unknown error'),
          imageUrl
        );

        if (logErrors) {
          console.warn(`[MediaHandler] Image processing failed: ${MediaErrorHandler.getUserFriendlyMessage(mediaError)}`);
        }

        return {
          success: false,
          error: MediaErrorHandler.getUserFriendlyMessage(mediaError),
          ...(includeErrorDetails && { errorDetails: mediaError })
        };
      }
    } catch (error) {
      const mediaError = MediaErrorHandler.categorizeError(error as Error, imageUrl);
      
      if (logErrors) {
        console.error(`[MediaHandler] Unexpected error processing image: ${mediaError.message}`, error);
      }

      return {
        success: false,
        error: MediaErrorHandler.getUserFriendlyMessage(mediaError),
        ...(includeErrorDetails && { errorDetails: mediaError })
      };
    }
  }

  /**
   * Batch processes multiple images with individual error handling
   * @param imageUrls Array of image URLs to process
   * @param options Processing options
   * @returns Promise resolving to array of results
   */
  async batchProcessImages(
    imageUrls: string[],
    options: {
      maxConcurrent?: number;
      continueOnError?: boolean;
    } = {}
  ): Promise<Array<ImageProcessResult & { url: string }>> {
    const { maxConcurrent = 3, continueOnError = true } = options;
    const results: Array<ImageProcessResult & { url: string }> = [];

    // Process images in batches to avoid overwhelming the system
    for (let i = 0; i < imageUrls.length; i += maxConcurrent) {
      const batch = imageUrls.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (url) => {
        try {
          const result = await this.fetchAndUploadImage(url);
          return { ...result, url };
        } catch (error) {
          if (!continueOnError) {
            throw error;
          }
          
          const mediaError = MediaErrorHandler.categorizeError(error as Error, url);
          return {
            success: false,
            error: MediaErrorHandler.getUserFriendlyMessage(mediaError),
            url
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }
}