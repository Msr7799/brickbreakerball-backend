import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dateFromCompact,ga4Rows,crashSummary,crashIssues,admobReport,adsenseReport} from '../src/lib/statistics-parsers.ts';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('GA4 rows use metric headers and dates exactly, without summing daily users',()=>{
 const data={metricHeaders:[{name:'activeUsers'},{name:'sessions'}],rows:[{dimensionValues:[{value:'20261119'}],metricValues:[{value:'20'},{value:'24'}]}]};
 assert.deepEqual(ga4Rows(data),[{label:'20261119',values:{activeUsers:20,sessions:24}}]);
 assert.equal(dateFromCompact('20261119'),'2026-11-19');
 assert.equal(dateFromCompact('20260230'),null);
 assert.equal(dateFromCompact('not-a-date'),null);
});

test('Crashlytics derives issue counts and never treats missing reports as zero',()=>{
 assert.equal(crashSummary({groups:[]}),null);
 const data={groups:[{issue:{id:'abc',title:'Stage barrier',errorType:'FATAL',state:'OPEN',uri:'https://console.firebase.google.com/a'},metrics:[{eventsCount:'12',impactedUsersCount:'1',crashFreeUsersPercentage:98.57}]}]};
 assert.equal(crashSummary(data)?.events,12);
 assert.equal(crashSummary(data)?.crashFreeUsers,98.57);
 assert.equal(crashIssues(data)[0].type,'FATAL');
 assert.equal(crashIssues({groups:[{issue:{id:'abc',title:'X',uri:'https://evil.example/'}}]})[0].url,null);
});

test('AdMob empty reports preserve currency and missing earnings',()=>{
 assert.deepEqual(admobReport([{header:{localizationSettings:{currencyCode:'EUR'}}},{footer:{}}]),{currency:'EUR',rows:[]});
 const rows=admobReport([{header:{localizationSettings:{currencyCode:'EUR'}}},{row:{dimensionValues:{DATE:{value:'20261119'}},metricValues:{ESTIMATED_EARNINGS:{microsValue:'2500000'},IMPRESSIONS:{integerValue:'100'},CLICKS:{integerValue:'4'}}}}]);
 assert.deepEqual(rows.rows[0],{date:'2026-11-19',earnings:2.5,impressions:100,clicks:4});
});

test('AdSense rows map DATE and metrics by actual header names',()=>{
 const parsed=adsenseReport({headers:[{name:'DATE'},{name:'ESTIMATED_EARNINGS'},{name:'IMPRESSIONS'},{name:'CLICKS'}],rows:[{cells:[{value:'2026-11-19'},{value:'1.25'},{value:'55'},{value:'2'}]}],metadata:{currencyCode:'USD'}});
 assert.equal(parsed.currency,'USD');
 assert.deepEqual(parsed.rows[0],{date:'2026-11-19',earnings:1.25,impressions:55,clicks:2});
});

test('statistics endpoint is admin-only and read-only',()=>{
 const route=read('app/api/mcp-control/statistics/route.ts');
 assert.match(route,/controlAuthorized\(request\)/);
 assert.match(route,/\["7","30","90"\]/);
 assert.doesNotMatch(route,/POST|PATCH|DELETE/);
 const stats=read('src/lib/operations-statistics.ts');
 assert.match(stats,/toolsMeta\.length/);
 assert.match(stats,/analyticsReport\("summary"/);
 assert.match(stats,/crashlyticsGetReport/);
 assert.match(read('app/mcp-dashboard/page.tsx'),/\/mcp-dashboard\/statistics/);
});
