import React, { useState } from 'react';
import { createPromoVideo } from '../services/geminiService';

interface Props {
  onBack: () => void;
}

// Removed the 'declare global' block as 'aistudio' is already defined with type 'AIStudio' in the global scope.
// We use type assertion (window as any).aistudio to access it safely without conflicting with the existing definition.

export default function VideoGenerator({ onBack }: Props) {
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    try {
      setError(null);
      // Accessing aistudio from window with a type assertion to avoid conflicts with global types
      const aistudio = (window as any).aistudio;

      const hasKey = await aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await aistudio.openSelectKey();
        // Proceeding after triggering key selection as per instructions
      }

      const prompt =
        'A short, stylish promotional video for a loyalty app called STAMPIX. A happy customer shows their digital stamp card on a smartphone to a barista in a modern cafe. Vibrant colors, sunlight, 4k quality, trendy vibe.';

      const url = await createPromoVideo(prompt, (status) => {
        setLoadingStatus(status);
      });

      setVideoUrl(url);
      setLoadingStatus(null);
    } catch (err: any) {
      if (err?.message?.includes('Requested entity was not found')) {
        setError(
          'נראה שיש בעיה עם מפתח ה-API. אנא בחר מפתח פעיל עם חיוב מופעל.'
        );
        const aistudio = (window as any).aistudio;
        await aistudio.openSelectKey();
      } else {
        setError('משהו השתבש בתהליך היצירה. נסה שוב מאוחר יותר.');
      }
      setLoadingStatus(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 animate-in slide-in-from-bottom duration-300">
      <header className="flex items-center gap-4 mb-8">
        <button
          onClick={onBack}
          className="p-2 bg-white rounded-full shadow-sm"
        >
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
        <h1 className="text-xl font-bold">יצירת וידאו שיווקי AI</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center">
        {!loadingStatus && !videoUrl && (
          <div className="space-y-6">
            <div className="size-24 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto text-primary">
              <span className="material-symbols-outlined text-5xl">
                movie_edit
              </span>
            </div>
            <div>
              <h2 className="text-2xl font-black mb-2">
                צור פרסומת ב-10 שניות
              </h2>
              <p className="text-gray-500 leading-relaxed">
                הבינה המלאכותית שלנו תיצור עבורך סרטון שיווקי מרהיב לעסק. הסרטון
                ידגים ללקוחות כמה קל להשתמש ב-STAMPIX אצלך.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-amber-800 text-sm">
              <p className="font-bold mb-1">שים לב:</p>
              <p>שימוש בפיצ'ר זה דורש פרויקט GCP עם חיוב מופעל.</p>
              <a
                href="https://ai.google.dev/gemini-api/docs/billing"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-600 underline font-bold"
              >
                למידע על הגדרת חיוב
              </a>
            </div>

            <button
              onClick={handleGenerate}
              className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined">bolt</span>
              צור סרטון עכשיו
            </button>
          </div>
        )}

        {loadingStatus && (
          <div className="space-y-8 w-full">
            <div className="relative size-40 mx-auto">
              <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
              <div className="absolute inset-4 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-4xl animate-pulse">
                  auto_videocam
                </span>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-text-main mb-2">
                הקסם מתרחש...
              </h3>
              <p className="text-primary font-medium text-lg animate-pulse">
                {loadingStatus}
              </p>
            </div>
            <p className="text-gray-400 text-sm">
              זה עשוי לקחת דקה או שתיים, אל תסגור את האפליקציה
            </p>
          </div>
        )}

        {videoUrl && (
          <div className="w-full space-y-6 animate-in zoom-in">
            <div className="aspect-[9/16] w-full max-w-[280px] mx-auto bg-black rounded-3xl overflow-hidden shadow-2xl ring-8 ring-white">
              <video
                src={videoUrl}
                controls={true}
                autoPlay={true}
                loop={true}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col gap-3">
              <a
                href={videoUrl}
                download="stampix-promo.mp4"
                className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined">download</span>
                הורד סרטון לגלריה
              </a>
              <button
                onClick={() => setVideoUrl(null)}
                className="text-gray-500 font-bold py-2"
              >
                צור סרטון אחר
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
