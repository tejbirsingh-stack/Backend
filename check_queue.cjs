const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis();
const fastQueue = new Queue('compression-jobs', { connection });
const heavyQueue = new Queue('compression-jobs-heavy', { connection });

async function check() {
  const [fastCounts, heavyCounts] = await Promise.all([
    fastQueue.getJobCounts(),
    heavyQueue.getJobCounts()
  ]);
  console.log('Fast Queue:', fastCounts);
  console.log('Heavy Queue:', heavyCounts);
  
  const failedFast = await fastQueue.getFailed(0, 10);
  if (failedFast.length > 0) {
    console.log('Failed Fast Jobs:', failedFast.map(j => ({ id: j.id, failedReason: j.failedReason, data: j.data })));
  }
  process.exit(0);
}
check();
