import { runJob, type JobRequest } from "./jobs";

self.onmessage = (e: MessageEvent<JobRequest>) => self.postMessage(runJob(e.data));
