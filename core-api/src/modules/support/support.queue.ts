import mongoose from 'mongoose';
import { SupportQueue, QUEUE_DOC_ID, type IQueueState } from './support.model';

export interface IQueueAgent {
  _id: mongoose.Types.ObjectId | string;
  name: string;
  email: string;
}

export class SupportQueueService {
  async getState(): Promise<IQueueState> {
    const state = await SupportQueue.findOneAndUpdate(
      { _id: QUEUE_DOC_ID },
      {
        $setOnInsert: {
          lastIndex: -1,
          totalAssigned: 0,
        },
      },
      { upsert: true, new: true }
    );

    return state;
  }

  async nextAgent(agents: IQueueAgent[]): Promise<IQueueAgent | null> {
    if (agents.length === 0) {
      return null;
    }

    const state = await this.getState();
    const nextIndex = (state.lastIndex + 1) % agents.length;

    await SupportQueue.findOneAndUpdate(
      { _id: QUEUE_DOC_ID },
      {
        $set: { lastIndex: nextIndex },
        $inc: { totalAssigned: 1 },
      },
      { upsert: true }
    );

    return agents[nextIndex] ?? null;
  }

  async getQueueStats(agents: IQueueAgent[]): Promise<object> {
    const state = await this.getState();
    const nextIndex = agents.length > 0 ? (state.lastIndex + 1) % agents.length : -1;

    return {
      totalAssigned: state.totalAssigned,
      lastIndex: state.lastIndex,
      agentCount: agents.length,
      nextAgentId: agents.length > 0 ? agents[nextIndex]?._id ?? null : null,
      agents: agents.map((agent, index) => ({
        _id: agent._id,
        name: agent.name,
        email: agent.email,
        isNext: index === nextIndex,
      })),
    };
  }
}

export const supportQueueService = new SupportQueueService();
