import React, { useState } from 'react';
import { LevelResult } from '../types';
import { Assignment } from '../utils/assignment';
import { CodePanel } from './Modals';

/**
 * Grade Report tab (like SynthLab and AudioPlot): students get their code here; the teacher's batch grader lives here too.
 */
export const GradeReport: React.FC<{ results: LevelResult[]; learned: string[]; assignment: Assignment | null; onTeacher: () => void; onAssign: () => void; onChart: () => void }> = ({ results, learned, assignment, onTeacher, onAssign, onChart }) => (
  <div className="mx-auto grid w-full max-w-4xl gap-4 p-4 md:grid-cols-[minmax(0,1fr)_260px]" data-testid="grade-report">
    <section className="card p-4">
      <h2 className="h text-[24px] text-wal3">My grade report</h2>
      <div className="mt-2">
        <CodePanel results={results} learned={learned} assignment={assignment} />
      </div>
      <p className="mt-3 text-[13px] text-muted">Recorded something in Sandbox? Turn it in with “Save performance” there.</p>
    </section>
    <TeacherTools onTeacher={onTeacher} onAssign={onAssign} onChart={onChart} />
  </div>
);

/** The teacher's tools, folded away behind one button so students aren't pointed at them (his call). Not a lock: there
 *  is no login in this app, and nothing here can see or change anyone's work. Open only for this visit. */
const TeacherTools: React.FC<{ onTeacher: () => void; onAssign: () => void; onChart: () => void }> = ({ onTeacher, onAssign, onChart }) => {
  const [open, setOpen] = useState(false);
  return (
    <section className="card h-fit p-4">
      {!open ? (
        <button className="btn w-full" onClick={() => setOpen(true)} data-testid="teacher-tools">
          Teacher tools
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="h text-[18px] text-wal3">Teacher tools</h2>
            <button className="text-[13px] text-muted underline" onClick={() => setOpen(false)} data-testid="teacher-tools-hide">
              Hide
            </button>
          </div>
          <p className="mt-1 text-[14px] text-wal1">Paste a class’s codes to see everyone’s grades, the class top and the class average.</p>
          <button className="btn btn-dark mt-2 w-full" onClick={onTeacher} data-testid="teacher">
            Batch grade codes
          </button>
          <p className="mt-3 text-[14px] text-wal1">Make a link that opens PianoLab on just the levels you pick, with your limits.</p>
          <button className="btn btn-dark mt-2 w-full" onClick={onAssign} data-testid="make-assignment">
            Make an assignment link
          </button>
          <p className="mt-3 text-[14px] text-wal1">Songs lesson: tap along with a YouTube video to find its tempo and where bar 1 starts.</p>
          <button className="btn btn-dark mt-2 w-full" onClick={onChart} data-testid="chart-song-open">
            Chart a song
          </button>
        </>
      )}
    </section>
  );
};
