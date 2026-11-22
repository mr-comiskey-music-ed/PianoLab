import React from 'react';
import { LevelResult } from '../types';
import { CodePanel } from './Modals';

/**
 * Grade Report tab (like SynthLab and AudioPlot): students get their code here; the teacher's batch grader lives here too.
 */
export const GradeReport: React.FC<{ results: LevelResult[]; learned: string[]; onTeacher: () => void }> = ({ results, learned, onTeacher }) => (
  <div className="mx-auto grid w-full max-w-4xl gap-4 p-4 md:grid-cols-[minmax(0,1fr)_260px]" data-testid="grade-report">
    <section className="card p-4">
      <h2 className="h text-[24px] text-wal3">My grade report</h2>
      <div className="mt-2">
        <CodePanel results={results} learned={learned} />
      </div>
      <p className="mt-3 text-[13px] text-muted">Recorded something in Sandbox? Turn it in with “Save performance” there.</p>
    </section>
    <section className="card h-fit p-4">
      <h2 className="h text-[18px] text-wal3">Teacher</h2>
      <p className="mt-1 text-[14px] text-wal1">Paste a class’s codes to see everyone’s grades, the class top and the class average.</p>
      <button className="btn btn-dark mt-3 w-full" onClick={onTeacher} data-testid="teacher">
        Batch grade codes
      </button>
    </section>
  </div>
);
