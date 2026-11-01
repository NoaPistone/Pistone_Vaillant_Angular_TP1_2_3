import { FileSizePipe } from './file-size.pipe';

describe('FileSizePipe', () => {
  const pipe = new FileSizePipe();

  it('formate les octets, Ko et Mo', () => {
    expect(pipe.transform(512)).toBe('512 o');
    expect(pipe.transform(1536)).toBe('1.5 Ko');
    expect(pipe.transform(5 * 1024 * 1024)).toBe('5.0 Mo');
  });
});
