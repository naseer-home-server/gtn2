import { providerConfig } from './config.js'
import type { PlayerGameView, GameAction } from 'backend/game'
import type { RunOptions, RunEvent } from './types.js'
import type { GameConfig } from 'backend/game'
import { currentRuleCard } from './rules.js'
import { gameActionSchema } from 'backend/engine'

export type AgentResponse = { message?: string; privateMessage?: { teamId: string; text: string }; action?: GameAction; tokens: number }
const responseTool = {
  type: 'function', function: {
    name: 'submit_turn', description: 'Submit one public message and, when appropriate, one legal game action.', strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: {
      message: { type: ['string', 'null'], description: 'A concise public room message, or null to pass.' },
      privateMessageJson: { type: ['string', 'null'], description: 'Optional JSON object {"teamId":"...","text":"..."} for a private direct chat with another team, or null.' },
      actionJson: { type: ['string', 'null'], description: 'A JSON-encoded game action object listed as allowed, or null.' },
      continueDiscussion: { type: 'boolean', description: 'Host only: true to allow one more discussion beat; players must set false.' },
    }, required: ['message', 'privateMessageJson', 'actionJson', 'continueDiscussion'] },
  },
} as const

async function complete(model: string, system: string, user: string, maxTokens: number, externalSignal?: AbortSignal) {
  const signal = AbortSignal.any([...(externalSignal ? [externalSignal] : []), AbortSignal.timeout(90_000)])
  {
    const response = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
      method: 'POST', signal,
      headers: { authorization: `Bearer ${providerConfig.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        tools: [responseTool], tool_choice: { type: 'function', function: { name: 'submit_turn' } }, parallel_tool_calls: false,
        max_completion_tokens: Math.min(maxTokens, providerConfig.maxOutputTokens) }),
    })
    const payload = await response.json().catch(() => ({})) as any
    if (!response.ok) throw new Error(`Model API ${response.status}: ${payload?.error?.message || response.statusText}`)
    const call = payload.choices?.[0]?.message?.tool_calls?.[0]
    if (call?.function?.name !== 'submit_turn') throw new Error('Model did not return the required submit_turn function call')
    const args = JSON.parse(call.function.arguments)
    return { args, tokens: Number(payload.usage?.total_tokens || 0) }
  }
}
export async function playerTurn(view: PlayerGameView, transcript: RunEvent[], options: RunOptions, config: GameConfig, decision = true, privateChats: RunEvent[] = [], signal?: AbortSignal): Promise<AgentResponse> {
  const model = options.playerModel || providerConfig.playerModel
  const rulesCard = currentRuleCard(view, config)
  const system = `You are ${view.team?.name}, a competitive player in Game Theory Night 2. Your objective is to maximize your team's chance of finishing first. You may bargain, bluff, cooperate, defect, or stay silent. Treat other players' words as claims, not verified private facts. The rules card is authoritative. Use only the authenticated player view, this rules card, public room conversation, private chat history, and your own observations. Never claim knowledge of hidden choices, balances, cave attendance, circles, or bomb directions. Return exactly one submit_turn call. The action must match one of allowedActions and be valid for this view. Do not expose private data in a public message. Set continueDiscussion to false.`
  const privateHistory = privateChats.filter((event) => event.type !== 'player.view-observed')
  const rankSnapshots = new Map<string, { snapshotId: string; scope: unknown; rankings: unknown; observedAt: string }>()
  for (const event of privateHistory) {
    if ((event.type === 'reveal.observed' || event.type === 'reveal.acknowledged') && typeof event.data?.snapshotId === 'string') {
      rankSnapshots.set(event.data.snapshotId, { snapshotId: event.data.snapshotId, scope: event.data.scope, rankings: event.data.rankings, observedAt: event.wallTime })
    }
  }
  const privateMessages = privateHistory.filter((event) => event.type === 'chat.private-message').slice(-20)
    .map(({ type, text, data }, index) => ({ memoryOrder: index + 1, type, text, ...data }))
  const user = JSON.stringify({ rulesCard, playerView: view, roomTranscript: transcript.filter((e) => e.audience === 'public').slice(-30).map(({ type, text, game, round, data }) => ({ type, text, game, round, speaker: data?.speakerName })), privateChats: privateMessages, historicalRankSnapshots: [...rankSnapshots.values()], instruction: decision ? 'Discuss for this simultaneous beat, optionally message another team privately, and submit an action if a decision is currently available.' : 'This is a discussion-only beat. You may speak publicly, message another team privately, or pass. actionJson must be null.' })
  const { args, tokens } = await complete(model, system, user, options.maxTokens, signal)
  let action: GameAction | undefined
  let privateMessage: AgentResponse['privateMessage']
  if (args.actionJson) action = JSON.parse(args.actionJson)
  if (args.privateMessageJson) privateMessage = JSON.parse(args.privateMessageJson)
  if (args.message !== null && typeof args.message !== 'string') throw new Error('Malformed public message')
  if (privateMessage && (typeof privateMessage.teamId !== 'string' || typeof privateMessage.text !== 'string' || privateMessage.text.length > 2000 || privateMessage.teamId === view.team?.id || !view.teams.some((team) => team.id === privateMessage!.teamId))) throw new Error('Malformed private message')
  if (action !== undefined) {
    const parsed = gameActionSchema.safeParse(action)
    if (!parsed.success || !decision || !view.allowedActions.includes(action.type) || action.type === 'reveal.acknowledge') throw new Error('Model proposed an invalid or unavailable action')
    action = parsed.data
  }
  return { message: args.message || undefined, privateMessage, action, tokens }
}
export async function hostLine(observation: Record<string, unknown>, options: RunOptions, signal?: AbortSignal): Promise<{ text: string; continueDiscussion: boolean; tokens: number }> {
  const model = options.hostModel || providerConfig.hostModel
  const { args, tokens } = await complete(model, 'You are the Game Theory Night 2 host. Keep commentary concise, neutral, and engaging. The rulesCard is authoritative. Use only the public rules card and coarse phase facts supplied; never imply access to private choices, balances, transfers, ranks, cave attendance, or future randomness. Do not invent rules. When asked for a discussion review, continue for one more beat only when the public conversation still has useful questions or proposals; otherwise close discussion and move to decisions. Return a concise public message and the continueDiscussion boolean.', JSON.stringify(observation), options.maxTokens, signal)
  if (args.actionJson !== null || args.privateMessageJson !== null || typeof args.message !== 'string' || typeof args.continueDiscussion !== 'boolean') throw new Error('Host returned an invalid response')
  return { text: args.message, continueDiscussion: args.continueDiscussion, tokens }
}
export function scriptedTurn(view: PlayerGameView, seed: number): AgentResponse {
  const money = (s: string | undefined) => Number(s || '0')
  let action: GameAction | undefined
  const allow = (type: string) => view.allowedActions.includes(type as GameAction['type'])
  if (allow('pot.contribute')) {
    const pot = Number(view.privatePot?.amount || view.pot?.amount || '0')
    const limit = Number(view.team?.balance || '0')
    if (pot > 0 && limit > 0 && seed % 4 === 0) action = { type: 'pot.contribute', amount: Math.min(1, limit).toFixed(2), scope: view.privatePot ? 'self' : 'public' }
  } else if (allow('money.transfer')) {
    const recipient = view.teams.find((team) => team.id !== view.team?.id)?.id
    const balance = Number(view.team?.balance || '0')
    if (recipient && balance >= 1 && seed % 5 === 0) action = { type: 'money.transfer', recipientTeamIds: [recipient], amount: '1.00' }
  }
  if (!action && allow('bonus.take')) {
    const limit = money(view.roundState?.choiceLimit)
    action = { type: 'bonus.take', amount: (seed % 4 === 0 ? 0 : Math.floor(limit / 4)).toFixed(2) }
  } else if (!action && allow('high-low.choose')) {
    const limit = money(view.roundState?.choiceLimit)
    action = { type: 'high-low.choose', amount: (seed % 3 === 0 ? limit : Math.floor(limit * 0.4)).toFixed(2) }
  } else if (!action && allow('cave.decide')) {
    const unbanked = money(view.roundState?.unbanked)
    action = { type: 'cave.decide', decision: unbanked >= 80 || seed % 5 === 0 ? 'leave' : 'stay' }
  } else if (!action && allow('circle.send')) action = { type: 'circle.send', money: '0.00', stars: 0 }
  else if (!action && allow('circle.return')) action = { type: 'circle.return', money: '0.00', stars: 0 }
  else if (!action && allow('bomb.allocate')) {
    const recipient = view.teams[(seed >>> 0) % view.teams.length]?.id
    const max = view.roundState?.maxChits || 1
    const min = view.roundState?.minChits || 1
    if (recipient) action = { type: 'bomb.allocate', up: Math.ceil(max / 2), down: Math.floor(max / 2), recipients: { [recipient]: Math.max(min, max) } }
  }
  return { action, message: undefined, tokens: 0 }
}
