import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';

interface AISummaryButtonProps {
  title: string;
  severity: string;
  sourceIp: string;
  status: string;
}

export const AISummaryButton: React.FC<AISummaryButtonProps> = ({
  title,
  severity,
  sourceIp,
  status,
}) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const token = localStorage.getItem('token') || '';

  const handleSummarize = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/ai/summarize-incident', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: `Incident: ${title}\nSeverity: ${severity}\nSource IP: ${sourceIp}\nStatus: ${status}\n\nProvide a concise SOC analyst summary including attack classification, impact assessment, and recommended response actions.`,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.summary) {
        setSummary(data.summary);
        setShowSummary(true);
      } else if (data.status === 'error') {
        setError(data.message || 'Failed to generate summary');
      } else {
        setError('Unexpected response format');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleSummarize}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors
          bg-soc-card border-gray-700 text-soc-accent hover:bg-soc-accent/10 hover:border-soc-accent/50
          disabled:opacity-50 disabled:cursor-not-allowed"
        title="AI Incident Summary"
      >
        {loading ? (
          <>
            <Sparkles className="w-3 h-3 animate-pulse" />
            Analyzing...
          </>
        ) : (
          <>
            <Sparkles className="w-3 h-3" />
            AI Summary
          </>
        )}
      </button>

      {error && (
        <p className="text-xs text-soc-alert mt-1">{error}</p>
      )}

      {showSummary && summary && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-soc-card border border-gray-700 rounded-lg p-4 shadow-xl z-50">
          <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-soc-accent" />
            AI Analysis
          </h4>
          <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{summary}</p>
          <button
            onClick={() => setShowSummary(false)}
            className="mt-2 text-xs text-soc-muted hover:text-white underline"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
