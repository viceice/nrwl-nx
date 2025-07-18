import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { extractFrontmatter } from '@nx/nx-dev-ui-markdoc';
import { readFileSync, lstatSync } from 'fs';
import { Course, Lesson } from './course.types';
import { calculateTotalDuration } from './duration.utils';

export class CoursesApi {
  // TODO: move to shared lib
  private readonly blogRoot = 'public/documentation/blog';

  constructor(
    private readonly options: {
      coursesRoot: string;
    }
  ) {
    if (!options.coursesRoot) {
      throw new Error('courses root cannot be undefined');
    }
  }

  async getAllCourses(): Promise<Course[]> {
    const courseFolders = await readdir(this.options.coursesRoot);
    const courses = await Promise.all(
      courseFolders
        .filter((directory) => {
          const stat = lstatSync(join(this.options.coursesRoot, directory));
          return stat.isDirectory();
        })
        .map((folder) => this.getCourse(folder))
    );
    return courses.sort((a, b) => {
      // If both courses have order, sort by order
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      // If only one has order, prioritize the one with order
      if (a.order !== undefined) return -1;
      if (b.order !== undefined) return 1;
      // If neither has order, sort by id (folder name)
      return a.id.localeCompare(b.id);
    });
  }

  async getCourse(folderName: string): Promise<Course> {
    const authors = JSON.parse(
      readFileSync(join(this.blogRoot, 'authors.json'), 'utf8')
    );
    const coursePath = join(this.options.coursesRoot, folderName);
    const courseFilePath = join(coursePath, 'course.md');

    const content = await readFile(courseFilePath, 'utf-8');
    const frontmatter = extractFrontmatter(content);

    let lessons: Lesson[] = [];
    if (!frontmatter.externalLink) {
      const lessonFolders = await readdir(coursePath);
      const tmpLessons = await Promise.all(
        lessonFolders
          .filter((folder) => {
            const stat = lstatSync(join(coursePath, folder));
            return stat.isDirectory();
          })
          .map((folder) => this.getLessons(folderName, folder))
      );
      lessons = tmpLessons.flat();
    }

    return {
      id: folderName,
      title: frontmatter.title,
      description: frontmatter.description,
      content,
      authors: authors.filter((author: { name: string }) =>
        frontmatter.authors.includes(author.name)
      ),
      repository: frontmatter.repository,
      lessons,
      filePath: courseFilePath,
      totalDuration: calculateTotalDuration(lessons),
      lessonCount: frontmatter.lessonCount,
      externalLink: frontmatter.externalLink,
      order: frontmatter.order,
    };
  }

  private async getLessons(
    courseId: string,
    lessonFolder: string
  ): Promise<Lesson[]> {
    const lessonPath = join(this.options.coursesRoot, courseId, lessonFolder);
    const lessonFiles = await readdir(lessonPath);

    const lessons = await Promise.all(
      lessonFiles.map(async (file) => {
        if (!file.endsWith('.md')) return null;
        const filePath = join(lessonPath, file);
        const content = await readFile(filePath, 'utf-8');
        const frontmatter = extractFrontmatter(content);
        if (!frontmatter || !frontmatter.title) {
          throw new Error(`Lesson ${lessonFolder}/${file} has no title`);
        }
        return {
          id: `${lessonFolder}-${file.replace('.md', '')}`,
          title: frontmatter.title,
          description: content,
          videoUrl: frontmatter.videoUrl || null,
          duration: frontmatter.duration || null,
          filePath,
        };
      })
    );

    return lessons.filter((lesson): lesson is Lesson => lesson !== null);
  }
}
