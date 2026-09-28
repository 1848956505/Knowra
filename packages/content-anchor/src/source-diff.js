import { sourceEdit } from './dynamic.js';

/** Separate distant serialization changes (e.g. final newline) from the user's edit. */
export function sourceEdits(before, after) {
  const span = sourceEdit(before, after);
  if (span.from === span.to && !span.text) return [];
  const left = before.slice(span.from, span.to), right = span.text;
  if (left.length * right.length > 1000000) {
    // Split at a unique unchanged line before falling back to one conservative replacement.
    const leftLines = left.split('\n');
    for (const line of leftLines.sort((a,b)=>b.length-a.length)) {
      if (line.length < 8) break;
      const x = left.indexOf(line), y = right.indexOf(line);
      if (y >= 0 && left.indexOf(line,x+1)<0 && right.indexOf(line,y+1)<0) {
        const first = sourceEdits(left.slice(0,x),right.slice(0,y)).map(edit=>({...edit,from:edit.from+span.from,to:edit.to+span.from}));
        const second = sourceEdits(left.slice(x+line.length),right.slice(y+line.length)).map(edit=>({...edit,from:edit.from+span.from+y+line.length,to:edit.to+span.from+y+line.length}));
        return [...first,...second];
      }
    }
    return [span];
  }
  const width=right.length+1, table=new Uint32Array((left.length+1)*width);
  for(let x=left.length-1;x>=0;x--) for(let y=right.length-1;y>=0;y--) table[x*width+y]=left[x]===right[y]?1+table[(x+1)*width+y+1]:Math.max(table[(x+1)*width+y],table[x*width+y+1]);
  const edits=[];let x=0,y=0,position=span.from,current=null;
  const flush=()=>{if(current){edits.push(current);position=current.from+current.text.length;current=null;}};
  while(x<left.length||y<right.length){
    if(x<left.length&&y<right.length&&left[x]===right[y]){flush();x++;y++;position++;continue;}
    current??={from:position,to:position,text:''};
    if(y<right.length&&(x===left.length||table[x*width+y+1]>table[(x+1)*width+y]))current.text+=right[y++];
    else {current.to++;x++;}
  }
  flush();return edits;
}
