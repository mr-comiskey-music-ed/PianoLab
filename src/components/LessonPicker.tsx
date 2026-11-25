import React from 'react';
import { Lesson, LevelResult } from '../types';
import { passed } from '../utils/grading';

/**
 * Pick a lesson (all lessons are open; Mr. Comiskey sets the pace in class). A tick means every Challenge level in that
 * lesson is passed; a dot means its Learn is finished.
 */
export const LessonPicker: React.FC<{ lessons: Lesson[]; current: string; learned: string[]; results: LevelResult[]; onPick: (id: string) => void }> = ({
  lessons,
  current,
  learned,
  results,
  onPick,
}) => (
  <div className="mb-2" data-testid="lesson-picker">
    <div className="h text-[11px] uppercase text-muted">Lesson</div>
    <div className={`mt-1 grid gap-x-1 gap-y-2 ${lessons.length > 8 ? 'grid-cols-6' : 'grid-flow-col auto-cols-fr'}`} role="radiogroup" aria-label="Lesson">
      {lessons.map((l) => {
        const all = l.levels.every((v) => {
          const r = results.find((x) => x.levelId === v.id);
          return r && passed(r.raw, v);
        });
        const sel = l.id === current;
        return (
          <button
            key={l.id}
            role="radio"
            aria-checked={sel}
            aria-label={`Lesson ${l.number}: ${l.title}`}
            title={`Lesson ${l.number}: ${l.title}`}
            data-testid={`lesson-${l.number}`}
            onClick={() => onPick(l.id)}
            className={`h relative flex h-8 items-center justify-center rounded-md border text-[15px] ${sel ? 'border-brass2 bg-brass text-brasstext' : 'border-line2 bg-panel text-wal2 hover:bg-[#fff8ea]'}`}
          >
            {l.number}
            {all ? (
              <span className={`absolute -right-1 -top-1.5 rounded-full px-0.5 text-[10px] ${sel ? 'bg-wal3 text-brass' : 'bg-[#cfe3b4] text-good'}`}>✓</span>
            ) : learned.includes(l.id) ? (
              <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-good" />
            ) : null}
          </button>
        );
      })}
    </div>
  </div>
);
