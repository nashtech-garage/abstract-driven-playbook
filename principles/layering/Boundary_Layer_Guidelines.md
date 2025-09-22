# Boundary Layer Guidelines

## Purpose
The Boundary layer serves as the interface between external systems and your ADD application. It handles external communication protocols, data transformation, and provides stable contracts for external consumers.

## Core Responsibilities

### 1. **External Communication**
- HTTP/REST API endpoints
- GraphQL resolvers
- Message queue consumers
- CLI command handlers
- WebSocket handlers

### 2. **Data Contract Management**
- Input validation and sanitization
- Data Transfer Object (DTO) definitions
- Response formatting
- API versioning
- Error response standardization

### 3. **Protocol Translation**
- HTTP status codes
- Authentication/authorization headers
- Request/response middleware
- Content negotiation
- Rate limiting

## Implementation Guidelines

### ✅ What Belongs in Boundary Layer

#### DTOs (Data Transfer Objects)
```typescript
// Input DTOs - External to internal
export interface CreateUserDto {
  email: string;
  fullName: string;
  birthDate: string;      // ISO string for API compatibility
  preferences?: {
    newsletter: boolean;
    theme: 'light' | 'dark';
  };
}

export interface UpdateUserDto {
  email?: string;
  fullName?: string;
  preferences?: Partial<UserPreferencesDto>;
}

// Response DTOs - Internal to external
export interface UserResponseDto {
  id: string;             // Always string for API stability
  email: string;
  fullName: string;
  isActive: boolean;
  createdAt: string;      // ISO timestamp
  lastLoginAt?: string;   // Optional for external consumers
}

export interface UserListResponseDto {
  users: UserResponseDto[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasNext: boolean;
  };
}
```

#### Controllers/Handlers
```typescript
// HTTP Controllers
@Controller('users')
export class UserController {
  constructor(private readonly userOperator: UserOperator) {}

  @Post()
  @ApiResponse({ status: 201, type: UserResponseDto })
  async createUser(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    try {
      return await this.userOperator.createUser(dto);
    } catch (error) {
      throw this.mapToHttpError(error);
    }
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUser(@Param('id') id: string): Promise<UserResponseDto> {
    const user = await this.userOperator.getUserById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  @Get()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async getUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number
  ): Promise<UserListResponseDto> {
    return await this.userOperator.getUsers({ page, pageSize });
  }

  private mapToHttpError(error: Error): HttpException {
    if (error instanceof ValidationError) {
      return new BadRequestException(error.message);
    }
    if (error instanceof DuplicateError) {
      return new ConflictException(error.message);
    }
    if (error instanceof NotFoundError) {
      return new NotFoundException(error.message);
    }
    return new InternalServerErrorException('Internal server error');
  }
}

// Message Queue Handlers
@EventHandler('user.registered')
export class UserRegisteredHandler {
  constructor(private readonly userOperator: UserOperator) {}

  async handle(event: UserRegisteredEvent): Promise<void> {
    try {
      await this.userOperator.handleUserRegistered({
        userId: event.userId,
        timestamp: event.timestamp
      });
    } catch (error) {
      // Log error and potentially retry
      this.logger.error('Failed to handle user registered event', error);
      throw error;
    }
  }
}

// CLI Commands
@Command({
  name: 'user:create',
  description: 'Create a new user',
})
export class CreateUserCommand {
  constructor(private readonly userOperator: UserOperator) {}

  @Option({
    flags: '-e, --email <email>',
    description: 'User email address',
    required: true,
  })
  email: string;

  @Option({
    flags: '-n, --name <name>',
    description: 'User full name',
    required: true,
  })
  fullName: string;

  async run(): Promise<void> {
    try {
      const user = await this.userOperator.createUser({
        email: this.email,
        fullName: this.fullName,
        birthDate: new Date().toISOString()
      });

      console.log(`User created successfully: ${user.id}`);
    } catch (error) {
      console.error(`Failed to create user: ${error.message}`);
      process.exit(1);
    }
  }
}
```

#### Validation and Sanitization
```typescript
// Input validation pipes
@Injectable()
export class CreateUserValidationPipe implements PipeTransform {
  transform(value: CreateUserDto): CreateUserDto {
    // Sanitize input
    const sanitized = {
      email: value.email?.trim().toLowerCase(),
      fullName: value.fullName?.trim(),
      birthDate: value.birthDate?.trim(),
      preferences: value.preferences
    };

    // Basic format validation
    if (!this.isValidEmail(sanitized.email)) {
      throw new BadRequestException('Invalid email format');
    }

    if (!sanitized.fullName || sanitized.fullName.length < 2) {
      throw new BadRequestException('Full name must be at least 2 characters');
    }

    if (!this.isValidDate(sanitized.birthDate)) {
      throw new BadRequestException('Invalid birth date format');
    }

    return sanitized;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }
}

// Use in controller
@Post()
async createUser(
  @Body(CreateUserValidationPipe) dto: CreateUserDto
): Promise<UserResponseDto> {
  return await this.userOperator.createUser(dto);
}
```

#### Error Handling and Response Formatting
```typescript
// Global exception filter
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    } else if (exception instanceof ValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
    } else if (exception instanceof NotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: exception.stack })
    };

    response.status(status).json(errorResponse);
  }
}

// Response interceptor for consistent formatting
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<any> {
    return next.handle().pipe(
      map(data => ({
        success: true,
        data,
        timestamp: new Date().toISOString()
      }))
    );
  }
}
```

### ❌ What Does NOT Belong in Boundary Layer

#### Business Logic
```typescript
// ❌ DON'T: Business logic in controller
@Controller('users')
export class UserController {
  @Post()
  async createUser(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    // Business validation belongs in Operators
    if (dto.email.includes('test')) {
      throw new BadRequestException('Test emails not allowed');
    }

    // Business rules belong in Operators
    const age = this.calculateAge(new Date(dto.birthDate));
    if (age < 13) {
      throw new BadRequestException('Must be at least 13 years old');
    }

    // Entity creation belongs in Core Abstractions
    const user = new User(
      UserId.generate(),
      new Email(dto.email),
      FullName.fromString(dto.fullName),
      new Date(dto.birthDate),
      true,
      new Date()
    );

    // Data persistence belongs in Implementations
    await this.userRepository.save(user);

    return this.mapToDto(user);
  }
}

// ✅ DO: Delegate to Operators
@Controller('users')
export class UserController {
  constructor(private readonly userOperator: UserOperator) {}

  @Post()
  async createUser(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return await this.userOperator.createUser(dto);
  }
}
```

#### Data Persistence
```typescript
// ❌ DON'T: Database operations in controller
@Controller('users')
export class UserController {
  constructor(private readonly userRepository: IUserRepository) {}

  @Post()
  async createUser(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    // Direct repository access belongs in Operators
    const existingUser = await this.userRepository.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const user = User.create(dto);
    await this.userRepository.save(user);

    return this.mapToDto(user);
  }
}
```

#### Complex Business Rules
```typescript
// ❌ DON'T: Complex business logic in DTOs
export class CreateUserDto {
  email: string;
  fullName: string;
  birthDate: string;

  // Business logic belongs in Operators/Entities
  calculateWelcomeBonus(): number {
    const age = this.calculateAge();
    return age >= 65 ? 100 : 50;
  }

  determineUserTier(): UserTier {
    // Complex business rules
    return UserTier.BASIC;
  }
}

// ✅ DO: Keep DTOs as simple data containers
export class CreateUserDto {
  email: string;
  fullName: string;
  birthDate: string;
}
```

## Best Practices

### 1. **API Versioning**
```typescript
// Version-specific DTOs
export namespace V1 {
  export interface CreateUserDto {
    email: string;
    name: string;  // Simple name in v1
  }
}

export namespace V2 {
  export interface CreateUserDto {
    email: string;
    fullName: string;    // Full name in v2
    birthDate: string;   // Added birth date in v2
  }
}

// Version-specific controllers
@Controller({ path: 'users', version: '1' })
export class UserV1Controller {
  @Post()
  async createUser(@Body() dto: V1.CreateUserDto): Promise<V1.UserResponseDto> {
    // Convert V1 DTO to current format
    const currentDto: V2.CreateUserDto = {
      email: dto.email,
      fullName: dto.name,
      birthDate: new Date().toISOString()  // Default for v1
    };

    const user = await this.userOperator.createUser(currentDto);
    return this.mapToV1Response(user);
  }
}

@Controller({ path: 'users', version: '2' })
export class UserV2Controller {
  @Post()
  async createUser(@Body() dto: V2.CreateUserDto): Promise<V2.UserResponseDto> {
    return await this.userOperator.createUser(dto);
  }
}
```

### 2. **Input Sanitization**
```typescript
// Comprehensive input sanitization
@Injectable()
export class InputSanitizationPipe implements PipeTransform {
  transform(value: any): any {
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    if (typeof value === 'object' && value !== null) {
      return this.sanitizeObject(value);
    }

    return value;
  }

  private sanitizeString(str: string): string {
    return str
      .trim()                          // Remove whitespace
      .replace(/[<>]/g, '')           // Remove potential XSS characters
      .substring(0, 1000);            // Limit length
  }

  private sanitizeObject(obj: any): any {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = this.transform(value);
    }
    return sanitized;
  }
}
```

### 3. **Response Consistency**
```typescript
// Consistent response format
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

// Response wrapper service
@Injectable()
export class ResponseService {
  success<T>(data: T, metadata?: any): ApiResponse<T> {
    return {
      success: true,
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: generateRequestId(),
        version: process.env.API_VERSION || '1.0.0',
        ...metadata
      }
    };
  }

  error(code: string, message: string, details?: any): ApiResponse<never> {
    return {
      success: false,
      error: { code, message, details },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: generateRequestId(),
        version: process.env.API_VERSION || '1.0.0'
      }
    };
  }
}
```

### 4. **Authentication Integration**
```typescript
// Auth guard for boundary layer
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    try {
      const payload = await this.authService.validateToken(token);
      request.user = payload;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid authentication token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

// Use in controllers
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  @Get('profile')
  async getProfile(@Request() req): Promise<UserResponseDto> {
    return await this.userOperator.getUserById(req.user.id);
  }
}
```

### 5. **Rate Limiting**
```typescript
// Rate limiting for boundary layer
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly rateLimiter: RateLimiterService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const identifier = this.getClientIdentifier(request);

    const isAllowed = await this.rateLimiter.checkLimit(identifier, {
      windowMs: 60000,    // 1 minute
      maxRequests: 100    // 100 requests per minute
    });

    if (!isAllowed) {
      throw new TooManyRequestsException('Rate limit exceeded');
    }

    return true;
  }

  private getClientIdentifier(request: Request): string {
    return request.ip || request.headers['x-forwarded-for'] as string;
  }
}
```

## File Organization

```
src/boundary/
├── dto/
│   ├── user/
│   │   ├── create-user.dto.ts
│   │   ├── update-user.dto.ts
│   │   ├── user-response.dto.ts
│   │   └── user-list-response.dto.ts
│   └── common/
│       ├── pagination.dto.ts
│       └── api-response.dto.ts
├── controllers/
│   ├── user.controller.ts
│   ├── auth.controller.ts
│   └── health.controller.ts
├── handlers/
│   ├── message-handlers/
│   │   └── user-registered.handler.ts
│   └── command-handlers/
│       └── create-user.command.ts
├── guards/
│   ├── auth.guard.ts
│   ├── rate-limit.guard.ts
│   └── roles.guard.ts
├── pipes/
│   ├── validation.pipe.ts
│   └── sanitization.pipe.ts
├── filters/
│   └── global-exception.filter.ts
└── interceptors/
    ├── response.interceptor.ts
    └── logging.interceptor.ts
```

## Testing Boundary Layer

### Unit Tests
```typescript
describe('UserController', () => {
  let controller: UserController;
  let mockUserOperator: jest.Mocked<UserOperator>;

  beforeEach(async () => {
    mockUserOperator = {
      createUser: jest.fn(),
      getUserById: jest.fn(),
      getUsers: jest.fn()
    } as any;

    const module = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        { provide: UserOperator, useValue: mockUserOperator }
      ]
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it('should create user successfully', async () => {
    const dto: CreateUserDto = {
      email: 'test@example.com',
      fullName: 'Test User',
      birthDate: '1990-01-01'
    };

    const expectedResponse: UserResponseDto = {
      id: '123',
      email: dto.email,
      fullName: dto.fullName,
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z'
    };

    mockUserOperator.createUser.mockResolvedValue(expectedResponse);

    const result = await controller.createUser(dto);

    expect(result).toEqual(expectedResponse);
    expect(mockUserOperator.createUser).toHaveBeenCalledWith(dto);
  });

  it('should handle operator errors correctly', async () => {
    const dto: CreateUserDto = {
      email: 'test@example.com',
      fullName: 'Test User',
      birthDate: '1990-01-01'
    };

    mockUserOperator.createUser.mockRejectedValue(new ValidationError('Invalid email'));

    await expect(controller.createUser(dto)).rejects.toThrow(BadRequestException);
  });
});
```

### Integration Tests
```typescript
describe('User API Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('should create user via API', () => {
    const createUserDto: CreateUserDto = {
      email: 'test@example.com',
      fullName: 'Test User',
      birthDate: '1990-01-01'
    };

    return request(app.getHttpServer())
      .post('/users')
      .send(createUserDto)
      .expect(201)
      .expect(res => {
        expect(res.body.email).toBe(createUserDto.email);
        expect(res.body.fullName).toBe(createUserDto.fullName);
        expect(res.body.id).toBeDefined();
      });
  });

  it('should validate input data', () => {
    const invalidDto = {
      email: 'invalid-email',
      fullName: '',
      birthDate: 'invalid-date'
    };

    return request(app.getHttpServer())
      .post('/users')
      .send(invalidDto)
      .expect(400);
  });
});
```

The Boundary layer is your application's front door—keep it focused on external communication while delegating business logic to appropriate layers.