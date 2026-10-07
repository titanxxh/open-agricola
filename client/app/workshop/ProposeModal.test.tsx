// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProposeModal } from './ProposeModal'
import { startPropose, submissionStatus } from '../../services/workshop-pr'

vi.mock('../../services/workshop-pr', () => ({ startPropose: vi.fn(), submissionStatus: vi.fn() }))
const card = {id:'card-db-id',card_id:'CUSTOM_TestCard',name:'测试卡',art_url:null}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(submissionStatus).mockResolvedValue({ok:false,code:'no_submission'}) })
describe('ProposeModal', () => {
  it('switches back to updating the existing PR when a closed PR reopens during restart', async () => {
    vi.mocked(submissionStatus).mockResolvedValue({ok:false,code:'pr_closed',prUrl:'https://github.com/titanxxh/open-agricola/pull/1'})
    vi.mocked(startPropose).mockResolvedValueOnce({ok:false,code:'pr_open'})
      .mockResolvedValue({ok:true,prNumber:1,prUrl:'https://github.com/titanxxh/open-agricola/pull/1'})
    render(<ProposeModal card={card} onClose={vi.fn()}/>)
    await screen.findByRole('button',{name:'重新投稿'})
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button',{name:'重新投稿'}))
    await userEvent.click(await screen.findByRole('button',{name:'发起 PR'}))
    expect(startPropose).toHaveBeenNthCalledWith(2,card.id,'submit')
    expect(screen.getByRole('link',{name:'查看审核 PR'}).getAttribute('href')).toContain('/1')
  })
  it('shows an artwork failure and keeps legacy resubmission and its PR link available', async () => {
    vi.mocked(submissionStatus).mockResolvedValue({ok:false,code:'legacy_submission',prUrl:'https://github.com/titanxxh/open-agricola/pull/704'})
    vi.mocked(startPropose).mockResolvedValue({ok:false,code:'art_unavailable'})
    render(<ProposeModal card={card} onClose={vi.fn()}/>)
    await screen.findByRole('button',{name:'重新投稿'})
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button',{name:'重新投稿'}))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('卡图文件暂不可用'))
    expect(screen.getByRole('link',{name:'查看审核 PR'}).getAttribute('href')).toContain('/704')
    await userEvent.click(screen.getByRole('button',{name:'重新投稿'}))
    expect(startPropose).toHaveBeenNthCalledWith(2,card.id,'restart')
    expect(screen.queryByRole('button',{name:'发起 PR'})).toBeNull()
    vi.mocked(startPropose).mockRejectedValue(new TypeError('Response lost'))
    vi.mocked(submissionStatus).mockResolvedValue({ok:false,submissionId:'saved-operation',state:'pending',code:'creation_unknown'})
    await userEvent.click(screen.getByRole('button',{name:'重新投稿'}))
    await screen.findByRole('button',{name:'再次核实'})
    expect(screen.queryByRole('button',{name:'重新投稿'})).toBeNull()
  })
  it('submits directly and displays the bot PR', async () => {
    vi.mocked(startPropose).mockResolvedValue({ok:true,prNumber:1,prUrl:'https://github.com/titanxxh/open-agricola/pull/1'})
    render(<ProposeModal card={card} onClose={vi.fn()}/>)
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button',{name:'发起 PR'}))
    expect((await screen.findByRole('link',{name:'查看审核 PR'})).getAttribute('href')).toBe('https://github.com/titanxxh/open-agricola/pull/1')
    expect(startPropose).toHaveBeenCalledWith(card.id,'submit')
  })
  it('reopens an unknown operation and only offers recovery', async () => {
    vi.mocked(submissionStatus).mockResolvedValue({ok:false,submissionId:'saved-operation',state:'pending',code:'creation_unknown'})
    vi.mocked(startPropose).mockResolvedValue({ok:false,submissionId:'saved-operation',state:'pending',code:'creation_unknown'})
    render(<ProposeModal card={card} onClose={vi.fn()}/>)
    await userEvent.click(await screen.findByRole('button',{name:'再次核实'}))
    expect(startPropose).toHaveBeenCalledWith(card.id,'recover')
    expect(screen.queryByRole('button',{name:'发起 PR'})).toBeNull()
    expect(screen.queryByRole('button',{name:'重新投稿'})).toBeNull()
  })
  it('keeps the original PR link visible during a source conflict', async () => {
    vi.mocked(submissionStatus).mockResolvedValue({ok:false,submissionId:'saved-operation',state:'blocked',code:'generated_file_changed',prUrl:'https://github.com/titanxxh/open-agricola/pull/1'})
    render(<ProposeModal card={card} onClose={vi.fn()}/>)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('人工修改均已保留'))
    expect(screen.getByRole('link',{name:'查看审核 PR'})).toBeTruthy()
  })
  it('recovers status after a lost HTTP response', async () => {
    vi.mocked(startPropose).mockRejectedValue(new TypeError('Network unavailable'))
    vi.mocked(submissionStatus).mockResolvedValueOnce({ok:false,code:'no_submission'})
      .mockResolvedValue({ok:true,prNumber:1,prUrl:'https://github.com/titanxxh/open-agricola/pull/1'})
    render(<ProposeModal card={card} onClose={vi.fn()}/>)
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button',{name:'发起 PR'}))
    expect(await screen.findByRole('link',{name:'查看审核 PR'})).toBeTruthy()
    expect(startPropose).toHaveBeenCalledTimes(1)
  })
})
