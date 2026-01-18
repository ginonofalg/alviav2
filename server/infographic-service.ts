import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const INFOGRAPHICS_DIR = path.join(__dirname, '../generated-infographics');
const MAX_STORED_INFOGRAPHICS = 100;

interface InfographicConfig {
  model?: 'gemini-3-pro-image-preview' | 'gemini-2.5-flash-image';
}

interface InfographicResult {
  id: string;
  imageUrl: string;
  prompt: string;
  model: string;
}

export class InfographicService {
  private ai: GoogleGenAI;

  constructor() {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    this.ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  async generateInfographic(
    prompt: string,
    config: InfographicConfig = {}
  ): Promise<InfographicResult> {
    const model = config.model || 'gemini-3-pro-image-preview';

    try {
      console.log('[Infographic] Starting generation with model:', model);
      console.log('[Infographic] Prompt length:', prompt.length);

      const response = await this.generateWithRetry(prompt, model);

      const imageData = this.extractImageData(response);

      const id = `infographic-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const filename = `${id}.png`;
      const filepath = path.join(INFOGRAPHICS_DIR, filename);

      await fs.mkdir(INFOGRAPHICS_DIR, { recursive: true });
      await fs.writeFile(filepath, Buffer.from(imageData, 'base64'));

      console.log('[Infographic] Saved to:', filepath);

      this.cleanupOldInfographics().catch(err => 
        console.error('[Infographic] Cleanup failed:', err)
      );

      return {
        id,
        imageUrl: `/infographics/${filename}`,
        prompt,
        model,
      };
    } catch (error) {
      console.error('[Infographic] Generation failed:', error);
      throw new Error(`Failed to generate infographic: ${(error as Error).message}`);
    }
  }

  private async cleanupOldInfographics(): Promise<void> {
    try {
      const files = await fs.readdir(INFOGRAPHICS_DIR);
      const pngFiles = files.filter(f => f.endsWith('.png'));
      
      if (pngFiles.length <= MAX_STORED_INFOGRAPHICS) {
        return;
      }

      const fileStats = await Promise.all(
        pngFiles.map(async (file) => {
          const filepath = path.join(INFOGRAPHICS_DIR, file);
          const stat = await fs.stat(filepath);
          return { file, mtime: stat.mtime.getTime() };
        })
      );

      fileStats.sort((a, b) => a.mtime - b.mtime);

      const filesToDelete = fileStats.slice(0, fileStats.length - MAX_STORED_INFOGRAPHICS);
      for (const { file } of filesToDelete) {
        await fs.unlink(path.join(INFOGRAPHICS_DIR, file));
        console.log('[Infographic] Cleaned up old file:', file);
      }
    } catch (error) {
      console.error('[Infographic] Cleanup error:', error);
    }
  }

  private async generateWithRetry(
    prompt: string,
    model: string,
    maxRetries = 3
  ): Promise<any> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`[Infographic] Attempt ${attempt + 1}/${maxRetries}`);

        const response = await this.ai.models.generateContent({
          model,
          contents: [{ 
            role: 'user', 
            parts: [{ text: prompt }] 
          }],
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        });

        const hasImage = this.checkForImage(response);
        if (!hasImage) {
          console.log(`[Infographic] Attempt ${attempt + 1} returned text only, retrying...`);
          if (attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        }

        return response;
      } catch (error: any) {
        lastError = error;
        console.error(`[Infographic] Attempt ${attempt + 1} failed:`, error.message);

        if (error.status === 429) {
          const delay = Math.pow(2, attempt) * 2000;
          console.log(`[Infographic] Rate limited. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        if (error.status === 503 || error.status === 500) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`[Infographic] Server error. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  private checkForImage(response: any): boolean {
    if (!response?.candidates?.[0]?.content?.parts) {
      return false;
    }
    return response.candidates[0].content.parts.some(
      (part: any) => part.inlineData?.data
    );
  }

  private extractImageData(response: any): string {
    if (!response?.candidates?.[0]?.content?.parts) {
      console.error('[Infographic] Invalid response structure:', JSON.stringify(response, null, 2));
      throw new Error('Invalid response structure from Gemini API');
    }

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData?.data) {
        console.log('[Infographic] Found image data, size:', part.inlineData.data.length);
        return part.inlineData.data;
      }
    }

    const textParts = response.candidates[0].content.parts
      .filter((p: any) => p.text)
      .map((p: any) => p.text);
    
    if (textParts.length > 0) {
      console.log('[Infographic] Response contained text but no image:', textParts.join('\n').substring(0, 500));
    }

    throw new Error('The AI model could not generate an image. Please try again with different analytics data.');
  }
}

let infographicServiceInstance: InfographicService | null = null;

export function getInfographicService(): InfographicService {
  if (!infographicServiceInstance) {
    infographicServiceInstance = new InfographicService();
  }
  return infographicServiceInstance;
}
