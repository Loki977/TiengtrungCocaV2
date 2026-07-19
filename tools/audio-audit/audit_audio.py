#!/usr/bin/env python3
"""Read-only audio audit for this repository. It never alters audio or inventories."""
from __future__ import annotations
import argparse, csv, hashlib, json, os, re, shutil, subprocess, sys, unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

AUDIO_EXTS = {'.mp3', '.wav', '.webm', '.ogg', '.m4a', '.aac', '.flac', '.opus'}
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'reports' / 'audio-audit'
IGNORE = {'.git', 'node_modules', '.venv', 'reports'}

def rel(p): return p.relative_to(ROOT).as_posix()
def human(n):
    for u in ('B','KiB','MiB','GiB','TiB'):
        if n < 1024 or u == 'TiB': return f'{n:.2f} {u}'
        n /= 1024
def sha256(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024), b''): h.update(b)
    return h.hexdigest()
def norm_text(s):
    s=unicodedata.normalize('NFKC', str(s)).strip().lower()
    return re.sub(r'[\s\u3000]+', '', re.sub(r'[，。！？；：、“”"\'’‘（）()【】\[\],.!?;:]+','',s))
def probe(path, ffprobe):
    result={'codec':'','duration':'','bitrate':'','sampleRate':'','channels':'','error':''}
    if path.stat().st_size == 0: result['error']='zero-byte'; return result
    if ffprobe:
        cmd=[ffprobe,'-v','error','-show_entries','format=duration,bit_rate:stream=codec_name,bit_rate,sample_rate,channels','-of','json',str(path)]
        try:
            x=json.loads(subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT, timeout=20, encoding='utf-8'))
            st=next((q for q in x.get('streams',[]) if q.get('codec_name')), {}) ; fmt=x.get('format',{})
            result.update(codec=st.get('codec_name',''), duration=fmt.get('duration',''), bitrate=st.get('bit_rate') or fmt.get('bit_rate',''), sampleRate=st.get('sample_rate',''), channels=st.get('channels',''))
            return result
        except Exception as e: result['error']='ffprobe: '+str(e)[:180]; return result
    # soundfile recognizes WAV and many locally supported compressed formats; no shell per file.
    try:
        import soundfile as sf
        info=sf.info(str(path)); result.update(codec=info.subtype or info.format or '', duration=info.duration, sampleRate=info.samplerate, channels=info.channels, bitrate='')
    except Exception as e:
        result['error']='unprobed (ffprobe unavailable): '+str(e)[:120]
    return result
def scan_json_references(files):
    refs=Counter(); missing=Counter(); inventory=[]; text_groups=defaultdict(list); parse_errors=[]
    path_re=re.compile(r"(?:assets/)?audio/[A-Za-z0-9_./%\-]+\.(?:mp3|wav|webm|ogg|m4a|aac|flac|opus)",re.I)
    def walk(x, origin):
        if isinstance(x,dict):
            p=x.get('path') or x.get('audioPath') or x.get('audioUrl') or x.get('url')
            if isinstance(p,str) and path_re.search(p):
                key=re.sub(r'^/?','',p.split('?')[0]).replace('\\','/')
                # Learning cache is a deliberately ignored generation source. The web MP3
                # derivative is the runtime asset, so it must not become a missing runtime ref.
                if '/cache/' not in key and '/.tmp/' not in key and '/.mp3-stage/' not in key:
                    refs[key]+=1
                txt=next((x.get(k) for k in ('normalizedText','text','hanzi','input','transcript','sentence','word') if x.get(k)), '')
                inventory.append((key,x,origin,txt))
                if txt: text_groups[(norm_text(txt),str(x.get('voice','')),str(x.get('rate','')),str(x.get('mode','')))].append(key)
            for v in x.values(): walk(v,origin)
        elif isinstance(x,list):
            for v in x: walk(v,origin)
        elif isinstance(x,str):
            for hit in path_re.findall(x):
                key=hit.lstrip('/').replace('\\','/')
                if '/cache/' not in key and '/.tmp/' not in key and '/.mp3-stage/' not in key: refs[key]+=1
    for f in files:
        try: walk(json.loads(f.read_text(encoding='utf-8-sig')),rel(f))
        except Exception as e: parse_errors.append(f'{rel(f)}: {e}')
    return refs, inventory, text_groups, parse_errors
def code_references(files):
    refs=Counter(); patterns=Counter(); rx=re.compile(r"(?:assets/)?audio/[A-Za-z0-9_./%\-]+\.(?:mp3|wav|webm|ogg|m4a|aac|flac|opus)",re.I)
    for f in files:
        try: content=f.read_text(encoding='utf-8',errors='ignore')
        except OSError: continue
        for m in rx.findall(content):
            key=m.lstrip('/').replace('\\','/')
            if '/cache/' not in key and '/.tmp/' not in key and '/.mp3-stage/' not in key: refs[key]+=1
        if 'assets/audio/' in content or 'new Audio' in content or 'speechSynthesis' in content: patterns[rel(f)]+=1
    return refs,patterns
def line_hits(path, needles):
    try: lines=path.read_text(encoding='utf-8',errors='ignore').splitlines()
    except OSError:return []
    return [i+1 for i,x in enumerate(lines) if any(n.lower() in x.lower() for n in needles)][:8]
def main():
    global ROOT, OUT
    ap=argparse.ArgumentParser(); ap.add_argument('--root',type=Path,default=ROOT); ap.add_argument('--output',type=Path,default=OUT); args=ap.parse_args()
    ROOT=args.root.resolve(); OUT=args.output.resolve(); OUT.mkdir(parents=True,exist_ok=True)
    started=datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds'); ffprobe=shutil.which('ffprobe')
    all_files=[p for p in ROOT.rglob('*') if p.is_file() and not any(x in IGNORE for x in p.relative_to(ROOT).parts)]
    audio=[p for p in all_files if p.suffix.lower() in AUDIO_EXTS]
    jsons=[p for p in all_files if p.suffix.lower()=='.json']
    code=[p for p in all_files if p.suffix.lower() in {'.html','.js','.mjs','.css','.json','.webmanifest'}]
    refs1, inventory, textgroups, parse_errors=scan_json_references(jsons); refs2, source_patterns=code_references(code)
    refs=refs1+refs2; existing={rel(p):p for p in audio}; records=[]; hashes=defaultdict(list); bydir=defaultdict(lambda:[0,0]); ext=Counter(); extsize=Counter(); total_duration=0.0; durations=0
    inv_by_path=defaultdict(list)
    for p,x,o,t in inventory: inv_by_path[p].append((x,o,t))
    for p in audio:
        rp=rel(p); size=p.stat().st_size; meta=probe(p,ffprobe); h=sha256(p); hashes[h].append(rp); ext[p.suffix.lower()]+=1; extsize[p.suffix.lower()]+=size
        parent=p.parent
        while parent != ROOT and parent not in (parent.parent,):
            bydir[rel(parent)][0]+=1; bydir[rel(parent)][1]+=size; parent=parent.parent
        inv=inv_by_path.get(rp,[]); x=inv[0][0] if inv else {}
        dur=float(meta['duration']) if str(meta['duration']).replace('.','',1).isdigit() else 0
        if dur and not meta['bitrate']:
            meta['bitrate']=round(size*8/dur)
        if dur: total_duration+=dur; durations+=1
        qc='ok'; errors=[]
        if size==0: qc='error'; errors.append('zero-byte')
        if meta['error']: qc='unverified' if 'unprobed' in meta['error'] else 'error'; errors.append(meta['error'])
        if dur==0 and not meta['error']: qc='error'; errors.append('zero-duration')
        if dur and dur<.1: qc='warning'; errors.append('under-100ms')
        if dur>15 and ('vocab' in rp or 'word' in rp): qc='warning'; errors.append('vocabulary-over-15s')
        if p.suffix.lower()=='.mp3' and meta['codec'] and not any(x in meta['codec'].lower() for x in ('mp3','mpeg_layer_iii')): qc='warning'; errors.append('extension-codec-mismatch')
        records.append({'path':rp,'extension':p.suffix.lower()[1:],'codec':meta['codec'],'sizeBytes':size,'duration':meta['duration'],'bitrate':meta['bitrate'],'sampleRate':meta['sampleRate'],'channels':meta['channels'],'sha256':h,'referencedStatus':'direct-or-inventory' if refs[rp] else ('inventory-only' if inv else 'unresolved'),'referenceCount':refs[rp],'voice':x.get('voice',''),'rate':x.get('rate',''),'mode':x.get('mode',''),'inventoryId':x.get('id',''),'qcStatus':qc,'error':'; '.join(errors)})
    missing=[(p,c) for p,c in refs.items() if p not in existing and not p.startswith('audio/')]
    dups=[]
    for h,paths in hashes.items():
        if len(paths)>1:
            sizes=[existing[p].stat().st_size for p in paths]; dups.append({'duplicateType':'sha256-identical','key':h,'voice':'','rate':'','files':' | '.join(paths),'extraFiles':len(paths)-1,'potentialSavingsBytes':sum(sizes)-max(sizes)})
    for (text,voice,rate,mode),paths in textgroups.items():
        unique=sorted(set(paths))
        if text and len(unique)>1: dups.append({'duplicateType':'same-normalized-content-config','key':text,'voice':voice,'rate':rate,'files':' | '.join(unique),'extraFiles':len(unique)-1,'potentialSavingsBytes':0})
    # CSVs
    def write_csv(name,rows,fields):
        with (OUT/name).open('w',newline='',encoding='utf-8-sig') as f: w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(rows)
    fields=['path','extension','codec','sizeBytes','duration','bitrate','sampleRate','channels','sha256','referencedStatus','referenceCount','voice','rate','mode','inventoryId','qcStatus','error']; write_csv('audio-files.csv',records,fields)
    write_csv('audio-duplicates.csv',dups,['duplicateType','key','voice','rate','files','extraFiles','potentialSavingsBytes'])
    orphans=[]
    for r in records:
        if not r['referenceCount'] and not r['inventoryId']: orphans.append({'path':r['path'],'reason':'No literal JSON/code reference nor inventory path found; dynamic URL use not disproven.','confidence':'low','sizeBytes':r['sizeBytes']})
        elif not r['referenceCount']: orphans.append({'path':r['path'],'reason':'Known only through inventory metadata; runtime use depends on dynamic lookup.','confidence':'medium','sizeBytes':r['sizeBytes']})
    write_csv('audio-orphans.csv',orphans,['path','reason','confidence','sizeBytes'])
    write_csv('audio-missing-references.csv',[{'path':p,'referenceCount':c,'reason':'Referenced static/inventory path does not exist in scanned audio files'} for p,c in missing],['path','referenceCount','reason'])
    br=Counter(); sr=Counter(); ch=Counter()
    for r in records:
        try: b=int(r['bitrate'])/1000
        except: b=None
        br['unknown' if b is None else '<32' if b<32 else '32-48' if b<=48 else '49-64' if b<=64 else '65-96' if b<=96 else '97-128' if b<=128 else '>128']+=1
        sr[str(r['sampleRate'] or 'unknown')]+=1; ch[str(r['channels'] or 'unknown')]+=1
    topdirs=sorted(((k,v[0],v[1]) for k,v in bydir.items()),key=lambda x:x[2],reverse=True)[:20]; largest=sorted(records,key=lambda x:x['sizeBytes'],reverse=True)[:30]
    git_size=sum(p.stat().st_size for p in (ROOT/'.git').rglob('*') if p.is_file()) if (ROOT/'.git').exists() else 0
    tree_size=sum(p.stat().st_size for p in all_files); tracked=set(os.popen('git ls-files 2>NUL').read().splitlines())
    tracked_audio=sum(1 for p in existing if p in tracked)
    voices=Counter(r['voice'] or 'unknown' for r in records)
    wav_target=sum(float(r['duration'] or 0)*8000 for r in records if r['extension']=='wav')
    wav_savings=max(0,extsize['.wav']-wav_target)
    tech={'ffprobeAvailable':bool(ffprobe),'probeMethod':'ffprobe' if ffprobe else 'python-soundfile; bitrate is estimated from file size/duration where FFprobe is unavailable','bitrateBuckets':dict(br),'sampleRate':dict(sr),'channels':dict(ch),'voices':dict(voices)}
    audit={'generatedAt':started,'root':str(ROOT),'summary':{'files':len(records),'bytes':sum(r['sizeBytes'] for r in records),'durationSeconds':total_duration,'durationReadFiles':durations,'extensions':dict(ext),'extensionBytes':dict(extsize),'errors':sum(r['qcStatus']=='error' for r in records),'zeroBytes':sum(r['sizeBytes']==0 for r in records),'identicalGroups':sum(1 for x in hashes.values() if len(x)>1),'identicalExtraFiles':sum(len(x)-1 for x in hashes.values() if len(x)>1),'identicalSavings':sum(x['potentialSavingsBytes'] for x in dups if x['duplicateType']=='sha256-identical'),'contentConfigGroups':sum(1 for x in dups if x['duplicateType']=='same-normalized-content-config'),'missingReferences':len(missing),'orphanCandidates':len(orphans),'workingTreeBytes':tree_size,'gitBytes':git_size,'gitTrackedAudio':tracked_audio,'wavToMp3_64kbpsPotentialSavings':wav_savings},'technical':tech,'topDirectories':[{'path':x[0],'files':x[1],'bytes':x[2]} for x in topdirs],'largestFiles':largest,'parseErrors':parse_errors,'sourcePatternFiles':dict(source_patterns)}
    (OUT/'audio-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
    source=[]
    for label,path,needles in [('Pinyin','assets/js/pinyin-intro.js',['manifest.json','speechSynthesis','new Audio']),('Khóa học','assets/js/speech-service.js',['web-index.json','new Audio','speechSynthesis']),('Flashcard','assets/js/flashcard.js',['CCAudio','speechSynthesis','audio']),('Luyện viết','assets/js/lesson-render.js',['CCAudio','speechSynthesis','audio']),('Thi thử','ThiThu.html',['audio','preload']),('Từ điển','assets/js/hsk.js',['CCAudio','speechSynthesis','audio']),('Challenge','assets/js/tang-thu-cac.js',['audio','speechSynthesis'])]:
        p=ROOT/path; source.append((label,path,line_hits(p,needles)))
    sm=['# Audio source map','','Các dòng dưới là điểm vào cần đọc; đây là phân tích tĩnh, không thay thế kiểm tra network trên trình duyệt.','', '| Khu vực | Nguồn/manifest và fallback | File : dòng |','|---|---|---|']
    for l,p,ls in source: sm.append(f'| {l} | Xem các lần khớp `audio`, manifest, `new Audio` và `speechSynthesis`. | `{p}`: {", ".join(map(str,ls)) or "không tìm thấy"} |')
    (OUT/'audio-source-map.md').write_text('\n'.join(sm)+'\n',encoding='utf-8')
    optim=['# Ước lượng tối ưu dung lượng (chưa thay đổi file)','',f'- Tổng audio hiện tại: **{human(audit["summary"]["bytes"])}**.',f'- Trùng tuyệt đối: **{human(audit["summary"]["identicalSavings"])}** (chỉ là tiềm năng, cần xác nhận đường dẫn/cache trước khi bỏ bản dư).',f'- WAV → MP3 mono 24 kHz / 64 kbps: ước tính tối đa **{human(wav_savings)}** từ {human(extsize[".wav"])} WAV (dựa trên duration; cần nghe/QC trước).','- Stereo → mono: không có file stereo, nên không có tiết kiệm từ phương án này.','- Bitrate MP3 là số suy ra size/duration do thiếu ffprobe; dùng lại sau khi có FFmpeg để xác nhận chính xác file >128 kbps.','- Audio production nằm dưới `assets/audio`; `vercel.json` đặt output directory là gốc và `.vercelignore` chỉ loại cache/staging/log, do đó audio không bị ignore có khả năng được đưa vào deployment.','', '## Các phương án kiến trúc','', '| Phương án | Lợi ích | Đánh đổi |','|---|---|---|','| A: MP3 trong repo | Đơn giản, cùng origin, offline cache dễ | Git/deploy nặng khi tăng 18k→50k file |','| B: object storage/CDN | Deploy nhanh hơn, cache/CDN linh hoạt | Cần mapping, quyền truy cập, giám sát object |','| C: hybrid | Giữ audio lõi gần app, phần lớn trên CDN | Hai nơi lưu trữ và chính sách cache phức tạp hơn |']
    (OUT/'audio-optimization-estimate.md').write_text('\n'.join(optim)+'\n',encoding='utf-8')
    summary=['# Báo cáo kiểm kê audio','','> Audit chỉ đọc; không audio, inventory, logic phát, Git history hay cấu hình production nào bị sửa.','',f'- Thời điểm: `{started}`','- Công cụ probe: '+tech['probeMethod'],'', '## Thống kê chính','', '| Chỉ số | Giá trị |','|---|---:|',f'| Tổng file audio | {len(records):,} |',f'| Tổng dung lượng | {human(audit["summary"]["bytes"])} |',f'| Trung bình/file | {human(audit["summary"]["bytes"]/len(records)) if records else "0 B"} |',f'| Tổng thời lượng đọc được | {total_duration/3600:.2f} giờ ({durations:,} file có duration) |',f'| File lỗi | {audit["summary"]["errors"]:,} |',f'| File 0 byte | {audit["summary"]["zeroBytes"]:,} |',f'| Audio Git-tracked | {tracked_audio:,} |', '', '## Định dạng','', '| Format | File | Dung lượng |','|---|---:|---:|']+[f'| {k[1:] or "không đuôi"} | {ext[k]:,} | {human(extsize[k])} |' for k in sorted(ext)]+['','## Top 20 thư mục theo dung lượng','','| Thư mục | File | Dung lượng |','|---|---:|---:|']+[f'| `{p}` | {n:,} | {human(s)} |' for p,n,s in topdirs]+['','## Top 30 file lớn nhất','','| File | Dung lượng | Codec | Duration |','|---|---:|---|---:|']+[f'| `{r["path"]}` | {human(r["sizeBytes"])} | {r["codec"] or "unknown"} | {r["duration"] or "unknown"} |' for r in largest]+['','## Vấn đề theo mức độ','','| Mức độ | Bằng chứng / ảnh hưởng |','|---|---|',f'| Cao | `vercel.json` deploy từ gốc; `.vercelignore` không loại MP3/WAV production. Audio có thể làm deployment/băng thông nặng. |',f'| Cao | {len(records):,} file; Git hiện theo dõi {tracked_audio:,}. `.git` là {human(git_size)}. Cần cân nhắc khi quy mô tăng. |',f'| Trung bình | {audit["summary"]["identicalGroups"]:,} nhóm trùng SHA-256, tiềm năng {human(audit["summary"]["identicalSavings"])}; chưa được xóa/hợp nhất. |',f'| Trung bình | {len(missing):,} tham chiếu tĩnh/inventory chưa khớp file quét; xem CSV trước khi kết luận runtime hỏng. |',f'| Trung bình | {len(orphans):,} ứng viên chưa có tham chiếu tĩnh rõ; URL sinh động khiến đây không phải kết luận an toàn để xóa. |', '| Thấp | Không có ffprobe, nên codec/bitrate đầy đủ và ước tính chuyển mã phải được chạy lại sau khi cài FFmpeg. |','','## Kết luận sơ bộ','','Audio lớn chủ yếu cần được phân loại thành production, cache/source/QC và bản trùng trước khi chọn A/B/C. Báo cáo này không khuyến nghị xóa file nào chỉ dựa trên quét tĩnh.']
    (OUT/'audio-audit-summary.md').write_text('\n'.join(summary)+'\n',encoding='utf-8')
    print(json.dumps(audit['summary'],ensure_ascii=False,indent=2)); print('Reports:',OUT)
if __name__=='__main__': main()
