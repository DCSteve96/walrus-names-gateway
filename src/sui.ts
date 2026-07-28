/* ── Sui 2.0 read helpers (gRPC) — replaces raw JSON-RPC (deactivated 2026-07-31). ── */
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { bcs } from '@mysten/sui/bcs'

type Net = 'mainnet' | 'testnet'
const netOf = (rpc: string): Net => (rpc.includes('testnet') ? 'testnet' : 'mainnet')
const GRPC_URLS: Record<Net, string> = {
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
}
const cache: Partial<Record<Net, SuiGrpcClient>> = {}
const grpc = (rpc: string): SuiGrpcClient => {
  const n = netOf(rpc)
  return (cache[n] ??= new SuiGrpcClient({ network: n, baseUrl: GRPC_URLS[n] }))
}

/** Object Move fields as flattened JSON (replaces sui_getObject.result.data.content.fields). */
export async function getObjectJson(rpc: string, id: string): Promise<any | null> {
  try {
    const r: any = await grpc(rpc).core.getObject({ objectId: id, include: { json: true } })
    return r?.object?.json ?? null
  } catch { return null }
}

/** Resolve a .epoch name → blob_id via the Registry records Table. '' if not found. */
export async function resolveNameBlob(rpc: string, registryId: string, name: string): Promise<string> {
  try {
    const core = grpc(rpc).core
    const reg: any = await core.getObject({ objectId: registryId, include: { json: true } })
    const tableId = reg?.object?.json?.records?.id
    if (!tableId) return ''
    const df: any = await core.getDynamicField({
      parentId: tableId, name: { type: '0x1::string::String', bcs: bcs.string().serialize(name).toBytes() },
    }).catch(() => null)
    const fieldId = df?.dynamicField?.fieldId
    if (!fieldId) return ''
    const obj: any = await core.getObject({ objectId: fieldId, include: { json: true } })
    return String(obj?.object?.json?.value?.blob_id ?? '')
  } catch { return '' }
}
