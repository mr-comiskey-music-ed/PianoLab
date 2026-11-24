import React from 'react';
import { LevelResult } from '../types';
import { Assignment } from '../utils/assignment';
import { CodePanel } from './Modals';

/**
 * Grade Report tab (like SynthLab and AudioPlot): students get their code here; the teacher's batch grader lives here too.
 */
export const GradeReport: React.FC<{ results: LevelResult[]; learned: string[]; assignment: Assignment | null; onTeacher: () => void; onAssign: () => void }> = ({ results, learned, assignment, onTeacher, onAssign }) => (
  <div className="mx-auto grid w-full max-w-4xl gap-4 p-4 md:grid-cols-[minmax(0,1fr)_260px]" data-testid="grade-report">
    <section className="card p-4">
      <h2 className="h text-[24px] text-wal3">My grade report</h2>
      <div className="mt-2">
        <CodePanel results={results} learned={learned} assignment={assignment} />
      </div>
      <p className="mt-3 text-[13px] text-muted">Recorded something in Sandbox? Turn it in with “Save performance” there.</p>
    </section>
    <section className="card h-fit p-4">
      <h2 className="h text-[18px] text-wal3">Teacher</h2>
      <p className="mt-1 text-[14px] text-wal1">Paste a class’s codes to see everyone’s grades, the class top and the class average.</p>
      <button className="btn btn-dark mt-3 w-full" onClick={onTeacher} data-testid="teacher">
        Batch grade codes
      </button>
      <p className="mt-3 text-[14px] text-wal1">Make a link that opens PianoLab on just the levels you pick, with your limits.</p>
      <button className="btn btn-dark mt-2 w-full" onClick={onAssign} data-testid="make-assignment">
        Make an assignment link
      </button>
    </section>
  </div>
);
