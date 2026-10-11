import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportProgress,reportPendingPaths,reasonProgress,serviceProgress,partProgress,dayProgress,combineProgress,memberProgress} from '../src/brlift/report-progress.ts';
const day=()=>({date:'2026-10-09',odometerStart:'',odometerEnd:'',hourmeter:'',outbound:{start:'',end:''},work:{start:'',end:''},inbound:{start:'',end:''},pause:{period:'work',minutes:''}});
const report=()=>({number:'',date:'2026-10-09',clientId:null,technicianId:null,payload:{type:'externo',operator:'',requester:'',location:'',auxiliaries:[],equipment:{},reasons:[],parts:[],days:[],concluded:'',released:'',photosSent:'',observations:''}});
test('entrada de seção direciona ao descendente pendente sem saltar dados principais',()=>{
 const e=report();assert.deepEqual(reportPendingPaths(e).A,['A']);
 Object.assign(e,{number:'AT1',clientId:'c'});
 assert.deepEqual(reportPendingPaths(e).A,['A','team','tech-0']);
 e.technicianId='t';e.payload.additionalTechnicians=[{technicianId:'',role:'auxiliary'}];
 assert.deepEqual(reportPendingPaths(e).A,['A','team','tech-1']);
 e.payload.reasons=[{id:'r',description:'Falha',pending:'',services:[{id:'s1',description:'Feito',notes:'',photos:[]},{id:'s2',description:'',notes:'',photos:[]}]}];
 assert.deepEqual(reportPendingPaths(e).C,['C','r','services-r','s2']);
 assert.deepEqual(reportPendingPaths(e)['C/r'],['C','r','services-r','s2']);
 e.payload.parts=[{id:'p',code:'X',quantity:0,kind:'requested'}];
 assert.deepEqual(reportPendingPaths(e).D,['D','p']);
 e.payload.days=[{...day(),id:'d'}];assert.deepEqual(reportPendingPaths(e).E,['E','d','person-t']);
 e.payload.days[0].periods=[{id:'p1',kind:'work',start:'08:00',end:'12:00',pauseMinutes:''},{id:'p2',kind:'work',start:'13:00',end:'',pauseMinutes:''}];
 assert.deepEqual(reportPendingPaths(e).E,['E','d','person-t','periods-work','p2']);
 assert.equal(reportProgress(e).E.state,'pending');
 e.payload.days[0].periods[1].end='14:00';e.payload.days[0].periods[1].pauseMinutes='61';assert.equal(reportProgress(e).E.state,'invalid');
});
test('cronograma direciona ao profissional pendente e ignora ausentes nos indicadores',()=>{
 const e=report();e.technicianId='a';e.payload.additionalTechnicians=[{technicianId:'b',role:'technician'},{technicianId:'c',role:'auxiliary'}];
 const person=(technicianId,present,periods)=>({technicianId,present,periods,odometerStart:'',odometerEnd:'',sameHoursAs:null,sameVehicleAs:null});
 const complete={id:'w',kind:'work',start:'08:00',end:'12:00',pauseMinutes:'15'};
 e.payload.days=[{...day(),id:'d',participants:[person('a',true,[complete]),person('b',true,[{...complete,id:'w2',end:'',pauseMinutes:''}]),person('c',false,[])]}];
 assert.equal(reportProgress(e).E.state,'pending');
 assert.deepEqual(reportPendingPaths(e).E,['E','d','person-b','periods-work','w2']);
 e.payload.days[0].participants[1].periods[0].end='12:00';assert.equal(reportProgress(e).E.state,'complete');
 e.payload.days[0].participants[1].periods=[];assert.equal(reportProgress(e).E.state,'pending');
 e.payload.days[0].participants[1].sameHoursAs='a';assert.equal(reportProgress(e).E.state,'complete');
 e.payload.days[0].participants[0].present=false;assert.equal(reportProgress(e).E.state,'invalid');
 e.payload.days[0].participants[1].present=false;assert.equal(reportProgress(e).E.state,'pending');
});
test('seções distinguem vazio, pendente, inválido e completo sem exigir campos opcionais',()=>{
 const e=report();assert.equal(reportProgress(e).A.state,'empty');
 e.number='AT1';assert.equal(reportProgress(e).A.state,'pending');
 e.date='2026-02-30';assert.equal(reportProgress(e).A.state,'invalid');
 e.date='2026-10-09';e.clientId='c';e.technicianId='t';assert.equal(reportProgress(e).A.state,'complete');
 e.payload.equipment={type:'Guindaste',brand:'Marca',model:'M',serial:'1'};assert.equal(reportProgress(e).B.state,'complete');
 e.payload.equipment.odometer='-1';assert.equal(reportProgress(e).B.state,'invalid');
 assert.equal(reportProgress(e).D.state,'empty');assert.equal(reportProgress(e).E.state,'empty');
 assert.equal(reportProgress(e).F.state,'empty');e.payload.concluded='Sim';assert.equal(reportProgress(e).F.state,'pending');
 Object.assign(e.payload,{released:'Não',photosSent:'Não',technicianSignature:{uri:'a'},clientSignature:{uri:'b'}});assert.equal(reportProgress(e).F.state,'complete');
});
test('indicadores de equipe detectam repetição e atualizam com remoção',()=>{
 const team=[{technicianId:'1',role:'technician'},{technicianId:'1',role:'auxiliary'}];
 assert.equal(memberProgress(team[0],team).state,'invalid');assert.equal(memberProgress(team[0],team.slice(0,1)).state,'complete');
 assert.equal(combineProgress([{state:'complete',detail:''},{state:'empty',detail:'Falta técnico'}]).state,'pending');
});
test('equipe com 200 profissionais não cria limite artificial',()=>{
 const e=report();Object.assign(e,{number:'AT2',clientId:'c',technicianId:'t0'});
 e.payload.additionalTechnicians=Array.from({length:199},(_,i)=>({technicianId:'t'+(i+1),role:i%2?'technician':'auxiliary'}));
 assert.equal(reportProgress(e).A.state,'complete');
 e.payload.additionalTechnicians[198].technicianId='t0';assert.equal(reportProgress(e).A.state,'invalid');
});
test('motivos e serviços exigem apenas os dados obrigatórios atuais',()=>{
 const r={description:'',pending:'',services:[]};assert.equal(reasonProgress(r).state,'empty');
 r.description='Falha';assert.equal(reasonProgress(r).state,'pending');
 r.services=[{description:'Reparo',notes:'',photos:[]}];assert.equal(reasonProgress(r).state,'complete');
 assert.equal(serviceProgress({description:'',notes:'Nota',photos:[]}).state,'pending');
});
test('peças validam quantidade e dias validam horários, virada de dia e pausa',()=>{
 assert.equal(partProgress({code:'',description:'',supplier:'',quantity:1,kind:'requested'}).state,'empty');
 assert.equal(partProgress({code:'X',quantity:0,kind:'requested'}).state,'invalid');
 assert.equal(dayProgress(day()).state,'empty');
 const d=day();d.work.start='22:00';assert.equal(dayProgress(d).state,'pending');
 d.work.end='02:00';d.pause.minutes='240';assert.equal(dayProgress(d).state,'complete');
 d.pause.minutes='241';assert.equal(dayProgress(d).state,'invalid');
 d.pause.minutes='0';d.odometerStart='10';d.odometerEnd='9';assert.equal(dayProgress(d).state,'invalid');
 d.odometerEnd='10';assert.equal(dayProgress(d).state,'complete');
 const entry=report();entry.payload.days=[d,day()];assert.equal(reportProgress(entry).E.state,'complete');
});
