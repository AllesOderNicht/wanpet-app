#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>

@interface WanpetGlassView : UIView
@property(nonatomic,strong) UIVisualEffectView *material;
@end

@implementation WanpetGlassView
- (instancetype)init {
  if ((self = [super init])) {
    self.userInteractionEnabled = NO;
    _material = [[UIVisualEffectView alloc] initWithEffect:nil];
    _material.userInteractionEnabled = NO;
    [self addSubview:_material];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(updateMaterial) name:UIAccessibilityReduceTransparencyStatusDidChangeNotification object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(updateMaterial) name:UIAccessibilityDarkerSystemColorsStatusDidChangeNotification object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(updateMaterial) name:UIAccessibilityReduceMotionStatusDidChangeNotification object:nil];
    [self updateMaterial];
  }
  return self;
}
- (void)dealloc { [[NSNotificationCenter defaultCenter] removeObserver:self]; }
- (void)updateMaterial {
  BOOL opaque = UIAccessibilityIsReduceTransparencyEnabled() || UIAccessibilityDarkerSystemColorsEnabled();
  self.material.backgroundColor = opaque ? [UIColor colorWithRed:1 green:.97 blue:.91 alpha:1] : UIColor.clearColor;
  if (opaque) {
    self.material.effect = nil;
  } else if (@available(iOS 26.0, *)) {
    UIGlassEffect *glass = [UIGlassEffect effectWithStyle:UIGlassEffectStyleClear];
    glass.interactive = NO;
    glass.tintColor = [UIColor colorWithRed:1 green:.97 blue:.91 alpha:.12];
    self.material.effect = glass;
  } else {
    self.material.effect = [UIBlurEffect effectWithStyle:UIBlurEffectStyleSystemThinMaterialLight];
  }
}
- (void)layoutSubviews {
  [super layoutSubviews];
  self.material.frame = self.bounds;
  self.material.layer.cornerRadius = MIN(self.bounds.size.width, self.bounds.size.height) / 2;
  self.material.layer.cornerCurve = kCACornerCurveContinuous;
  self.material.clipsToBounds = YES;
}
@end

@interface WanpetGlassViewManager : RCTViewManager @end
@implementation WanpetGlassViewManager
RCT_EXPORT_MODULE(WanpetGlassView)
- (UIView *)view { return [WanpetGlassView new]; }
@end

@interface WanpetSymbolView : UIView
@property(nonatomic,strong) UIImageView *image;
@property(nonatomic,copy) NSString *symbol;
@end
@implementation WanpetSymbolView
- (instancetype)init {
  if ((self = [super init])) {
    self.userInteractionEnabled = NO;
    _image = [UIImageView new];
    _image.contentMode = UIViewContentModeScaleAspectFit;
    _image.tintColor = [UIColor colorWithRed:.286 green:.243 blue:.188 alpha:1];
    [self addSubview:_image];
  }
  return self;
}
- (void)setSymbol:(NSString *)symbol {
  _symbol = [symbol copy];
  UIImageSymbolConfiguration *config = [UIImageSymbolConfiguration configurationWithPointSize:22 weight:UIImageSymbolWeightRegular];
  self.image.image = [UIImage systemImageNamed:symbol withConfiguration:config] ?: [UIImage systemImageNamed:@"house" withConfiguration:config];
}
- (void)layoutSubviews { [super layoutSubviews]; self.image.frame = self.bounds; }
@end
@interface WanpetSymbolViewManager : RCTViewManager @end
@implementation WanpetSymbolViewManager
RCT_EXPORT_MODULE(WanpetSymbolView)
RCT_EXPORT_VIEW_PROPERTY(symbol, NSString)
- (UIView *)view { return [WanpetSymbolView new]; }
@end
