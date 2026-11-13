import {notFound} from 'next/navigation';
import {currentUser} from '../../../../lib/auth';
import {contribution} from '../../../../lib/contributions';
import {loadChanges} from '../../../../lib/proposals';
import {openSnapshot,textPreview} from '../../../../lib/browse';
import ProposalForm from '../../../../components/proposal-form';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const user=await currentUser();const item=await contribution(id,user);if(!user||!item||item.author_id!==user.id||item.type!=='CODE')notFound();const rev=await loadChanges(id);if(!rev||!rev.changes.length)notFound();const snap=await openSnapshot(item.repo_id,rev.target_ref);if(!snap)notFound();const file=rev.changes[0];let original:string|null=null;try{const at=await snap.at(snap.head,file.path);original=textPreview((await snap.object(at.oid)).content)}catch{}if(original===null)return <div className="wrap content-page"><h1>Cannot revise this file.</h1><p>The file may have been removed or changed to binary.</p></div>;return <div className="wrap content-page wide-page"><div className="kicker">CODE PROPOSAL</div><h1>Revise proposal</h1><p>The editor starts from the current branch. Reapply your changes, review the diff, and submit again. Add any additional files from the previous revision.</p><div className="panel"><ProposalForm repoId={item.repo_id} base={snap.head} ref={rev.target_ref} path={file.path} original={original} contributionId={id}/></div></div>}
