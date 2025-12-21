import { describe, it, expect } from 'vitest';
import {
  canTransitionTo,
  canStartVoting,
  canStopVoting,
  canFinalize,
  canGenerateLaunchTx,
  canBroadcastLaunch,
  isLaunched,
  SESSION_STATUS_TRANSITIONS,
} from '@streampump/shared';

describe('Session State Transitions', () => {
  describe('canTransitionTo', () => {
    it('DRAFT can transition to VOTING', () => {
      expect(canTransitionTo('DRAFT', 'VOTING')).toBe(true);
    });

    it('DRAFT cannot transition to FINALIZED', () => {
      expect(canTransitionTo('DRAFT', 'FINALIZED')).toBe(false);
    });

    it('VOTING can transition to FINALIZED', () => {
      expect(canTransitionTo('VOTING', 'FINALIZED')).toBe(true);
    });

    it('VOTING can transition to FAILED', () => {
      expect(canTransitionTo('VOTING', 'FAILED')).toBe(true);
    });

    it('VOTING cannot transition to LAUNCHED', () => {
      expect(canTransitionTo('VOTING', 'LAUNCHED')).toBe(false);
    });

    it('FINALIZED can transition to LAUNCH_TX_READY', () => {
      expect(canTransitionTo('FINALIZED', 'LAUNCH_TX_READY')).toBe(true);
    });

    it('LAUNCH_TX_READY can transition to LAUNCHED', () => {
      expect(canTransitionTo('LAUNCH_TX_READY', 'LAUNCHED')).toBe(true);
    });

    it('LAUNCHED cannot transition to anything', () => {
      expect(canTransitionTo('LAUNCHED', 'DRAFT')).toBe(false);
      expect(canTransitionTo('LAUNCHED', 'VOTING')).toBe(false);
      expect(canTransitionTo('LAUNCHED', 'FAILED')).toBe(false);
    });

    it('FAILED cannot transition to anything', () => {
      expect(canTransitionTo('FAILED', 'DRAFT')).toBe(false);
      expect(canTransitionTo('FAILED', 'VOTING')).toBe(false);
      expect(canTransitionTo('FAILED', 'LAUNCHED')).toBe(false);
    });
  });

  describe('Helper functions', () => {
    it('canStartVoting returns true only for DRAFT', () => {
      expect(canStartVoting('DRAFT')).toBe(true);
      expect(canStartVoting('VOTING')).toBe(false);
      expect(canStartVoting('FINALIZED')).toBe(false);
      expect(canStartVoting('LAUNCHED')).toBe(false);
    });

    it('canStopVoting returns true only for VOTING', () => {
      expect(canStopVoting('VOTING')).toBe(true);
      expect(canStopVoting('DRAFT')).toBe(false);
      expect(canStopVoting('FINALIZED')).toBe(false);
    });

    it('canFinalize returns true only for VOTING', () => {
      expect(canFinalize('VOTING')).toBe(true);
      expect(canFinalize('DRAFT')).toBe(false);
      expect(canFinalize('FINALIZED')).toBe(false);
    });

    it('canGenerateLaunchTx returns true only for FINALIZED', () => {
      expect(canGenerateLaunchTx('FINALIZED')).toBe(true);
      expect(canGenerateLaunchTx('DRAFT')).toBe(false);
      expect(canGenerateLaunchTx('VOTING')).toBe(false);
      expect(canGenerateLaunchTx('LAUNCHED')).toBe(false);
    });

    it('canBroadcastLaunch returns true only for LAUNCH_TX_READY', () => {
      expect(canBroadcastLaunch('LAUNCH_TX_READY')).toBe(true);
      expect(canBroadcastLaunch('FINALIZED')).toBe(false);
      expect(canBroadcastLaunch('LAUNCHED')).toBe(false);
    });

    it('isLaunched returns true only for LAUNCHED', () => {
      expect(isLaunched('LAUNCHED')).toBe(true);
      expect(isLaunched('DRAFT')).toBe(false);
      expect(isLaunched('VOTING')).toBe(false);
      expect(isLaunched('FAILED')).toBe(false);
    });
  });

  describe('SESSION_STATUS_TRANSITIONS map', () => {
    it('defines all transitions correctly', () => {
      expect(SESSION_STATUS_TRANSITIONS.DRAFT).toEqual(['VOTING']);
      expect(SESSION_STATUS_TRANSITIONS.VOTING).toEqual(['FINALIZED', 'FAILED']);
      expect(SESSION_STATUS_TRANSITIONS.FINALIZED).toEqual(['LAUNCH_TX_READY', 'FAILED']);
      expect(SESSION_STATUS_TRANSITIONS.LAUNCH_TX_READY).toEqual(['LAUNCHED', 'FAILED']);
      expect(SESSION_STATUS_TRANSITIONS.LAUNCHED).toEqual([]);
      expect(SESSION_STATUS_TRANSITIONS.FAILED).toEqual([]);
    });
  });
});
