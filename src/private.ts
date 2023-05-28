/* eslint-disable @typescript-eslint/no-unused-vars */

import { Filter, nip04 } from 'nostr-tools';
import { NostrPool, NostrEvent } from '.';

export async function listChannels(pool: NostrPool, db_only=false): Promise<ChannelInfo[]> {
  // todo: this should only use the store, not go and re-query stuff, being lazy to get things done
  return (await pool.list([{ kinds: [40] }], db_only)).map((ent) => {
    return { ...JSON.parse(ent.content), id: ent.id, author: ent.pubkey };
  });
}

interface ChannelInfo {
  name: string;
  about: string;
  picture: string;
  id?: string;
  author?: string;
}

class Nip04Manager {
  private pool: NostrPool;
  //  private store: SqliteStore;

  constructor(pool: NostrPool) {
    this.pool = pool;
  }

  async send(
    pubkey: string,
    content: string,
    replyTo?: string,
    tags: string[][] = [],
  ): Promise<NostrEvent> {
    const oth: string[][] = [];
    if (replyTo) {
      oth.push(['e', replyTo, this.pool.relays[0], 'reply']);
    }
    const ev = await this.pool.send({
      kind: 4,
      content: await this.pool.ident.nip04Encrypt(pubkey, content),
      tags: [["p", pubkey], ...oth, ...tags],
    });
    return ev;
  }

  sub(callback: (ev: NostrEvent)=>void, filter: Filter = {}) {
    const filter_ex = [{ kinds: [4], '#p': [this.pool.ident.pubKey], ...filter }, {kinds: [4], authors: [this.pool.ident.pubKey], ...filter}]
    this.pool.sub(filter_ex, callback)
  }

  async list(filter: Filter = {}, db_only=false): Promise<NostrEvent[]> {
    const filter_ex = [{ kinds: [4], '#p': [this.pool.ident.pubKey], ...filter }, {kinds: [4], authors: [this.pool.ident.pubKey], ...filter}]
    const lst = await this.pool.list(filter_ex, db_only)
    const mapped = await Promise.all(lst.map(async (ev: NostrEvent)=>{
        try {
            if (ev.pubkey != this.pool.ident.pubKey) {
              ev.content = await this.pool.ident.nip04Decrypt(ev.pubkey, ev.content) 
            } else {
              const pubkey = ev.tags.find((t)=>t[0]=='p')?.[1] as string
              ev.content = await nip04.decrypt(this.pool.ident.privKey, pubkey, ev.content)
            }
            return ev.content ? ev : null
        } catch (e) {
            // can't decrypt, probably spam or whatever
            return null
        }
    }))
    
    return mapped.filter((ev: NostrEvent | null)=>{return ev != null}) as NostrEvent[];
  }
}

export default Nip04Manager;
