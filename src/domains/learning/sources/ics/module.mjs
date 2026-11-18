import {createHash} from 'node:crypto';
import {SourcePathNotFoundError} from '../../../../host/safe-errors.mjs';
import {parseCalendar} from './parse.mjs';
import {calendarError} from './time.mjs';

export const id = 'learning-ics';

export function createIcsSource(config, ports) {
  if (Boolean(config.path) === Boolean(config.url)) throw calendarError('ONE_LOCATION_REQUIRED');
  const location = config.path || config.url;
  // Location changes must not reuse another calendar's cached snapshot. A digest
  // is exposed rather than a path, private URL, or a title derived from either.
  const identity = createHash('sha256').update(JSON.stringify([config.id,location])).digest('hex').slice(0,24);
  return {
    id:`ics-${identity}`,domain:'learning',kind:'ics',title:config.title || 'ICS 日历',
    ...(config.intervalMs === undefined ? {} : {intervalMs:config.intervalMs}),
    capabilities:() => ['deadline','calendar-event'],
    async read(range) {
      let bytes;
      try { bytes = config.path ? await ports.files.read(config.path) : (await ports.http.get(config.url)).bytes; }
      catch (error) {
        if(config.path && error.code==='ENOENT')throw new SourcePathNotFoundError();
        throw calendarError('READ_FAILED');
      } // do not retain a credential-bearing cause
      const fetchedAt = ports.clock.now();
      try {
        const text = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
        return {...parseCalendar(text,config,range,fetchedAt),fetchedAt,mode:'replace',cursor:null};
      } catch (error) {
        // ICAL/Intl exceptions may echo an entire input line, including a URL.
        if (error.code && error.message === `ICS: ${error.code}`) throw error;
        throw calendarError('PARSE_FAILED');
      }
    },
  };
}

// Source settings owns registration.
