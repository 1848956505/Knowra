import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHashNavigation } from './useHashNavigation';

describe('workspace browser history', () => {
  it('restores folder addresses and truncates forward history after a new branch', async () => {
    window.history.replaceState(null, '', '#/materials');
    const { result } = renderHook(() => useHashNavigation());
    expect(result.current.canGoBack).toBe(false);
    act(() => result.current.navigate('/materials?folder=parent'));
    act(() => result.current.navigate('/materials?folder=child'));
    expect(result.current.canGoBack).toBe(true);
    act(() => result.current.back());
    await waitFor(() => expect(result.current.pathname).toBe('/materials?folder=parent'));
    expect(result.current.canGoForward).toBe(true);
    act(() => result.current.forward());
    await waitFor(() => expect(result.current.pathname).toBe('/materials?folder=child'));
    act(() => result.current.back());
    await waitFor(() => expect(result.current.pathname).toBe('/materials?folder=parent'));
    act(() => result.current.navigate('/materials?scope=favorites'));
    expect(result.current.canGoForward).toBe(false);
  });
});
