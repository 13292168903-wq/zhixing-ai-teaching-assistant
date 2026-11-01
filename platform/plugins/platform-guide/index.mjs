import {registerTicketTool} from '../../harness/ticket-tool.mjs';
export const name='platform-guide';export const inject=['tools'];
export function apply(ctx){registerTicketTool(ctx,'platform_guide');}
