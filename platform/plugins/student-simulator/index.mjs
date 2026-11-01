import {registerTicketTool} from '../../harness/ticket-tool.mjs';
export const name='student-simulator';export const inject=['tools'];
export function apply(ctx){registerTicketTool(ctx,'student_simulator');}
