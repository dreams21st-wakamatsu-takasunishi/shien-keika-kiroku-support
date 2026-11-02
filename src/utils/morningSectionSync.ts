import type {MorningMeetingRecord,MorningSectionDocument,MorningSectionKey} from '../types';
import {morningDocument,morningRevisions} from './morningSections';
export interface MorningFieldEdit {text:string;expected:number;version:number}
export interface MorningSectionState {record?:MorningMeetingRecord;edits:Partial<Record<MorningSectionKey,MorningFieldEdit>>;conflicts:Partial<Record<MorningSectionKey,boolean>>;sequence:number}
export const createMorningState=(record?:MorningMeetingRecord):MorningSectionState=>({record,edits:{},conflicts:{},sequence:0});
export function visibleMorningDocument(state:MorningSectionState):MorningSectionDocument{
 const doc=morningDocument(state.record);for(const [key,edit] of Object.entries(state.edits))doc[key as MorningSectionKey]=edit!.text;return doc;
}
export function editMorningField(state:MorningSectionState,key:MorningSectionKey,text:string):MorningSectionState{
 const sequence=state.sequence+1,previous=state.edits[key];
 return {...state,sequence,edits:{...state.edits,[key]:{text,expected:previous?.expected??morningRevisions(state.record)[key],version:sequence}}};
}
export function receiveMorningSnapshot(state:MorningSectionState,record:MorningMeetingRecord):MorningSectionState{
 if(state.record&&record.date!==state.record.date)return state;
 if(state.record&&record.revision<state.record.revision)return state;
 return {...state,record};
}
export function acknowledgeMorningSave(state:MorningSectionState,key:MorningSectionKey,version:number,record:MorningMeetingRecord,conflict:boolean):MorningSectionState{
 const merged=receiveMorningSnapshot(state,record),edits={...merged.edits},conflicts={...merged.conflicts};
 if(conflict){conflicts[key]=true;return {...merged,conflicts};}
 delete conflicts[key];
 if(edits[key]?.version===version)delete edits[key];
 else if(edits[key])edits[key]={...edits[key]!,expected:morningRevisions(record)[key]};
 return {...merged,edits,conflicts};
}
export function resolveMorningField(state:MorningSectionState,key:MorningSectionKey,keepMine:boolean):MorningSectionState{
 const edits={...state.edits},conflicts={...state.conflicts};delete conflicts[key];
 if(keepMine&&edits[key])edits[key]={...edits[key]!,expected:morningRevisions(state.record)[key]};else delete edits[key];
 return {...state,edits,conflicts};
}
