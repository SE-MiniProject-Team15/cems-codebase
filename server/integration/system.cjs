// Separate from teammates' unit suite: real HTTP, MongoDB transactions and SMTP.
const assert = require('node:assert/strict');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { SMTPServer } = require('smtp-server');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const results = [];
let repl, smtp, http, vite, browser;
const mail = [];
const password = 'Integration123!';
async function check(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log('PASS', name); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message }); throw error; }
}
(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ dbName: 'cems_sit' }] });
  smtp = new SMTPServer({ disabledCommands: ['STARTTLS'], onAuth(a,s,cb) { cb(null, { user: a.username }); }, onData(stream,s,cb) { let data=''; stream.on('data', c => data+=c); stream.on('end', () => { mail.push(data); cb(); }); } });
  await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve));
  Object.assign(process.env, { NODE_ENV: 'test', MONGO_URI: repl.getUri(), JWT_SECRET: 'isolated-sit-secret', CLIENT_URL: 'http://127.0.0.1:4175', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.server.address().port), SMTP_SECURE: 'false', SMTP_USER: 'sit@example.test', SMTP_PASS: 'sit', EMAIL_FROM: 'sit@example.test' });
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI);
  const app = require('../server');
  for (const model of Object.values(mongoose.models)) await model.init();
  http = app.listen(0, '127.0.0.1');
  await new Promise(resolve => http.once('listening', resolve));
  const base = `http://127.0.0.1:${http.address().port}/api`;
  const { performance } = require('node:perf_hooks');
  async function req(method, url, cookie, body, status=200) {
    const response = await fetch(base+url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    assert.equal(response.status, status, `${method} ${url}: ${JSON.stringify(data)}`);
    return { ...data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  let organizer, a, b, admin, event, code, initialRegistrationCode;
  await check('Account registration, login cookies, identity and role restrictions', async () => {
    async function registerAndLogin(account) {
      const registration = await req('POST','/auth/register',null,account,201);
      assert.equal(registration.cookie, undefined);
      return (await req('POST','/auth/login',null,{email:account.email,password})).cookie;
    }
    organizer = await registerAndLogin({ name:'Organizer',email:'org@example.test',password,role:'Organizer' });
    a = await registerAndLogin({ name:'Student A',email:'a@example.test',password });
    b = await registerAndLogin({ name:'Student B',email:'b@example.test',password });
    await mongoose.models.User.create({name:'Admin',email:'admin@example.test',password,role:'Admin'});
    admin = (await req('POST','/auth/login',null,{email:'admin@example.test',password})).cookie;
    assert.equal((await req('GET','/auth/me',a)).data.user.role,'Student');
    await req('GET','/events/admin/pending',a,null,403);
    await req('GET','/auth/me',null,null,401);
  });
  const start = Date.now()+48*3600000;
  await check('Event submission, approval transaction, audit and publication', async () => {
    event = (await req('POST','/events',organizer,{ title:'SIT Campus Event',category:'Workshop',description:'Integration scenario',venue:'SIT Hall',department:'CS',startDateTime:new Date(start),endDateTime:new Date(start+3600000),registrationDeadline:new Date(start-3600000),capacity:1,bannerUrl:'https://example.test/banner.png' },201)).data.event;
    assert.equal(event.status,'Pending Approval');
    assert.equal((await req('GET','/events/public')).data.events.length,0);
    await req('PATCH',`/events/admin/${event._id}/decision`,admin,{action:'approve'});
    assert.equal(await mongoose.models.EventAuditLog.countDocuments({event:event._id}),1);
    assert.equal((await req('GET','/events/public')).data.events.length,1);
  });
  await check('Registration capacity, duplicate prevention, waitlist and promotion', async () => {
    const registered = await req('POST',`/events/${event._id}/register`,a,{},201);
    assert.equal(registered.data.registration.status,'Registered');
    initialRegistrationCode = registered.data.registration.registrationCode;
    assert.match(initialRegistrationCode, /^REG-[A-Z0-9_-]{22}$/);
    await req('POST',`/events/${event._id}/register`,a,{},409);
    assert.equal((await req('POST',`/events/${event._id}/register`,b,{},201)).data.registration.status,'Waitlisted');
    assert.equal((await req('DELETE',`/events/${event._id}/register`,a)).data.promoted,true);
    const registration = (await req('GET','/registrations/me',b)).data.registrations[0];
    assert.equal(registration.status,'Registered'); code=registration.qrPayload;
    assert.ok(code);
    assert.ok(mail.some(message => message.includes(initialRegistrationCode)));
    assert.ok(mail.some(message => message.includes('cems-registration-ticket')));
  });
  await check('Notification ownership, read persistence and real SMTP delivery', async () => {
    const notices = (await req('GET','/notifications',b)).data.notifications;
    assert.ok(notices.some(n=>n.type==='WAITLIST_PROMOTED'));
    await req('PATCH',`/notifications/${notices[0]._id}/read`,a,{},404);
    await req('PATCH',`/notifications/${notices[0]._id}/read`,b,{});
    assert.equal((await mongoose.models.Notification.findById(notices[0]._id)).read,true);
    assert.ok(mail.some(m=>m.includes('b@example.test') && m.includes('off the waitlist')));
  });
  await check('Reminder persistence, SMTP delivery and duplicate suppression', async () => {
    const { runReminders } = require('../services/reminderJob');
    const now = new Date(start-24*3600000);
    await runReminders(now); await runReminders(now);
    assert.equal(await mongoose.models.Notification.countDocuments({event:event._id,type:'EVENT_REMINDER'}),1);
    assert.equal(mail.filter(m=>m.includes('Subject: Reminder:')).length,1);
  });
  await check('Live browser login and event discovery through real API and database', async () => {
    vite = spawn(process.execPath,[path.join(root,'client/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4175','--strictPort'],{cwd:path.join(root,'client'),env:{...process.env,VITE_API_URL:base},stdio:'ignore'});
    for(let i=0;i<100;i++){ try { if((await fetch('http://127.0.0.1:4175')).ok) break; } catch {} await new Promise(r=>setTimeout(r,100)); }
    const { chromium } = require('../../client/node_modules/@playwright/test');
    browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {}) });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:4175/login');
    await page.getByLabel('Email',{exact:true}).fill('b@example.test');
    await page.getByLabel('Password',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Log in',exact:true}).click();
    await page.waitForURL(/student/);
    await page.goto('http://127.0.0.1:4175/student/events');
    await page.getByText('SIT Campus Event',{exact:true}).first().waitFor();
    await browser.close(); browser=null;
  });
  await check('Attendance check-in, duplicate prevention and persisted attendance', async () => {
    // Fixture clock boundary: move the event into its attendance window.
    await mongoose.models.Event.updateOne({_id:event._id},{$set:{startDateTime:new Date(Date.now()-60000),endDateTime:new Date(Date.now()+3600000)}});
    await req('POST',`/events/${event._id}/attendance/check-in`,organizer,{code});
    await req('POST',`/events/${event._id}/attendance/check-in`,organizer,{code},409);
    const saved=await mongoose.models.Event.findById(event._id);
    assert.equal(saved.registrations.filter(r=>r.attendedAt).length,1);
    assert.equal(await mongoose.models.EventAuditLog.countDocuments({event:event._id}),2);
    const audit=(await req('GET','/events/admin/audit-logs',admin)).data.auditLogs;
    assert.ok(audit.some(entry => entry.action==='CHECK_IN' && entry.targetType==='Registration'));
  });
  await check('200 concurrent distinct registrations are atomic and stay below two seconds p95', async () => {
    const parallelStart = new Date(Date.now()+72*3600000);
    const parallelEvent = (await req('POST','/events',organizer,{
      title:'Concurrent Registration Event',
      category:'Workshop',
      description:'Atomic registration verification',
      venue:'Concurrency Test Hall',
      department:'CS',
      startDateTime:parallelStart,
      endDateTime:new Date(parallelStart.getTime()+3600000),
      registrationDeadline:new Date(parallelStart.getTime()-3600000),
      capacity:250,
      bannerUrl:'https://example.test/concurrency.png',
    },201)).data.event;
    await req('PATCH',`/events/admin/${parallelEvent._id}/decision`,admin,{action:'approve'});

    const passwordHash = await bcrypt.hash(password,10);
    const students = Array.from({length:200},(_,index)=>({
      _id:new mongoose.Types.ObjectId(),
      name:`Concurrency Student ${index}`,
      email:`concurrency-${index}@example.test`,
      password:passwordHash,
      role:'Student',
    }));
    await mongoose.models.User.collection.insertMany(students);
    const originalMailConfig = {
      SMTP_HOST:process.env.SMTP_HOST,
      SMTP_USER:process.env.SMTP_USER,
      SMTP_PASS:process.env.SMTP_PASS,
    };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    try {
      const requests = await Promise.all(students.map(async student => {
        const startedAt = performance.now();
        const response = await fetch(`${base}/events/${parallelEvent._id}/register`,{
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            Cookie:`token=${jwt.sign({id:student._id,role:'Student'},process.env.JWT_SECRET,{expiresIn:'1d'})}`,
          },
          body:'{}',
        });
        const data = await response.json();
        return {status:response.status,data,latency:performance.now()-startedAt};
      }));
      const latencies = requests.map(request=>request.latency).sort((left,right)=>left-right);
      const p95 = latencies[Math.ceil(latencies.length*0.95)-1];
      const conflicts = requests.filter(request=>request.status===409).length;
      const failures = requests.filter(request=>request.status!==201);
      assert.equal(conflicts,0,`${conflicts} requests returned HTTP 409`);
      assert.equal(failures.length,0,JSON.stringify(failures.slice(0,3)));
      assert.ok(p95<2000,`registration p95 was ${Math.round(p95)} ms`);
      const savedEvent = await mongoose.models.Event.findById(parallelEvent._id);
      assert.equal(savedEvent.registeredStudents.length,200);
      assert.equal(new Set(savedEvent.registeredStudents.map(String)).size,200);
      console.log(`Concurrent registration p95: ${Math.round(p95)} ms; 409 responses: ${conflicts}`);
    } finally {
      for (const [key,value] of Object.entries(originalMailConfig)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
  if(browser) await browser.close();
  if(vite) vite.kill();
  if(http) await new Promise(r=>http.close(r));
  await require('mongoose').disconnect();
  if(smtp) await new Promise(r=>smtp.close(r));
  if(repl) await repl.stop();
  const report={ executedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),node:process.version,results,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,exitCode:process.exitCode||0 };
  fs.writeFileSync(path.join(root,'docs/testing/system-integration-results.json'),JSON.stringify(report,null,2)+'\n');
});
