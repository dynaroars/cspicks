import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAjoList, parseAjoPosting } from '../../scripts/board-leads.mjs';

test('parseAjoList reads employer, unit, title, list deadline, and the external apply link', () => {
  const html = `<div class="clr"><h3 class="x1"><a href="/ajo/BU">Boston University</a>, <a href="/ajo/BU/CompSci">Department of Computer Science</a> </h3><ol>
<li>[<a href="/ajo/jobs/33223" id="k33223">ASTP</a>] <span id="j33223" aria-hidden="true">Assistant Professor</span>&nbsp;<span class="purplesml">(deadline 2026/11/15 11:59PM)</span> <span class="sml"><a href="https://academicjobsonline.org/ajo/jobs/33223/apply" >Apply</a></span></li>
</ol></div><div class="clr"><h3 class="x1"><a href="/ajo/UM">University of Miami</a> </h3><ol>
<li>[<a href="/ajo/jobs/33442" id="k33442">Q1</a>] <span id="j33442" aria-hidden="true">Assistant Professor in Computer Science - Quantum Computing</span> <span class="sml"><a href="https://umiami.wd1.myworkdayjobs.com/UMFaculty/job/R1?a=1&amp;b=2" >Apply <img src="/icons/external.png"></a></span></li></ol></div>`;
  assert.deepEqual(parseAjoList(html), [
    { id: '33223', school: 'Boston University', department: 'Department of Computer Science', title: 'Assistant Professor', deadline: '2026-11-15', apply: null },
    { id: '33442', school: 'University of Miami', department: '', title: 'Assistant Professor in Computer Science - Quantum Computing', deadline: '',
      apply: 'https://umiami.wd1.myworkdayjobs.com/UMFaculty/job/R1?a=1&b=2' }
  ]);
});

test('parseAjoPosting reads type, location, posted date, and deadline', () => {
  const html = `<div><b>Position Type:</b></div><div>Tenured/Tenure-track faculty</div>
<div><b>Position Location:</b></div><div>Portland, Oregon 97252, United States of America [<a href="#">map</a>]</div>
<div class="top"><b>Appl Deadline:</b></div><div class="ldt">2027/01/09 23:59:59  (posted <span class="zo">2026/11/05</span>, listed until 2027/05/05)</div>`;
  assert.deepEqual(parseAjoPosting(html), {
    type: 'Tenured/Tenure-track faculty', location: 'Portland, Oregon 97252, United States of America', posted: '2026-11-05', deadline: '2027-01-09'
  });
  assert.equal(parseAjoPosting('<div><b>Appl Deadline:</b></div><div>none (posted 2026/08/27 )</div>').deadline, 'none');
});
